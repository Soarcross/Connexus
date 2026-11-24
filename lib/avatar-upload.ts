import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

// Browser-only helpers (they use canvas and object URLs). Shared by the
// profile editor and the /welcome flow so both upload avatars the same way.

const MAX_AVATAR_BYTES = 2 * 1024 * 1024

// Formats that can carry an alpha channel. JPEG can't, so it never needs
// flattening. A transparent avatar otherwise shows the page background
// through it (the Avatar component's bg-secondary is a fallback safety
// net, not a substitute for fixing the stored file).
const ALPHA_CAPABLE_TYPES = ["image/png", "image/webp", "image/gif"]

/** A user-facing reason the file can't be used, or null when it's fine. */
export function validateAvatarFile(file: File): string | null {
    if (!file.type.startsWith("image/")) return "Please upload an image file."
    if (file.size > MAX_AVATAR_BYTES) return "Image must be under 2MB."
    return null
}

// Draws the image onto an opaque cream background and re-encodes as JPEG.
// Returns the original file if the source has no alpha channel, or if
// canvas encoding fails for any reason — upload should never hard-break
// over this.
async function flattenTransparency(file: File): Promise<File> {
    if (!ALPHA_CAPABLE_TYPES.includes(file.type)) return file

    try {
        const objectUrl = URL.createObjectURL(file)
        try {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const image = new window.Image()
                image.onload = () => resolve(image)
                image.onerror = reject
                image.src = objectUrl
            })

            const canvas = document.createElement("canvas")
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            const ctx = canvas.getContext("2d")
            if (!ctx) return file

            // Same cream the fallback background uses (--secondary, light
            // value) — the flattened file can't follow the viewer's theme,
            // so this is a fixed neutral rather than a per-theme match.
            ctx.fillStyle = "#f4ecd6"
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(img, 0, 0)

            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/jpeg", 0.92)
            )
            if (!blob) return file

            const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg"
            return new File([blob], newName, { type: "image/jpeg" })
        } finally {
            URL.revokeObjectURL(objectUrl)
        }
    } catch {
        return file
    }
}

/**
 * Uploads a new avatar to `avatars/${userId}/…`, points `profiles.avatar_url`
 * at it, then removes the user's older avatar files. Returns the public URL.
 * Throws on upload or update failure; call validateAvatarFile first.
 */
export async function uploadAvatar(
    supabase: SupabaseClient<Database>,
    userId: string,
    rawFile: File
): Promise<string> {
    const file = await flattenTransparency(rawFile)
    const fileExt = file.name.split(".").pop()
    const filePath = `${userId}/avatar-${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file)

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath)

    const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId)

    if (updateError) throw updateError

    // Only now remove the old files: deleting them first left
    // avatar_url pointing at nothing whenever the upload failed.
    // Best-effort -- a leftover file costs storage, not correctness.
    const { data: existingFiles } = await supabase.storage
        .from("avatars")
        .list(userId)
    const newFileName = filePath.slice(userId.length + 1)
    const filesToDelete = (existingFiles ?? [])
        .filter(f => f.name !== newFileName)
        .map(f => `${userId}/${f.name}`)
    if (filesToDelete.length > 0) {
        await supabase.storage.from("avatars").remove(filesToDelete)
    }

    return publicUrl
}
