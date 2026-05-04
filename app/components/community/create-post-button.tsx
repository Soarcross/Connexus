"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { getSupaBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Textarea } from "@/app/components/ui/textarea"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/app/components/ui/dialog"
import { Plus, Check, ImagePlus, X } from "lucide-react"

const CATEGORIES = ["Clubs", "Events", "Internships", "Jobs", "Research", "Scholarships", "Competitions", "Volunteering"] as const
const FIELDS = [
    "Computer Science", "Law", "Medicine", "Finance",
    "Engineering", "Research", "Business", "Design",
    "Journalism", "Education", "Biology", "Mathematics",
    "Cybersecurity", "Architecture", "Consulting", "Other"
] as const

type Category = typeof CATEGORIES[number]

const EMPTY_FORM = {
    title: "",
    description: "",
    category: "Clubs" as Category,
    field: "",
    organization: "",
    location: "",
    url: "",
    deadline: "",
    qualification: "",
}

type Props = {
    userId: string
}

export function CreatePostButton({ userId }: Props) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [submitted, setSubmitted] = useState(false)
    const [form, setForm] = useState(EMPTY_FORM)
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [dragging, setDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    function handleImageSelect(file: File) {
        if (!file.type.startsWith("image/")) {
            setError("Please upload an image file.")
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            setError("Image must be under 5MB.")
            return
        }
        setImageFile(file)
        setImagePreview(URL.createObjectURL(file))
        setError(null)
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) handleImageSelect(file)
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)

        if (!form.title || !form.description || !form.qualification) {
            setError("Title, description and qualification are required.")
            return
        }

        setLoading(true)
        const supabase = getSupaBrowserClient()

        try {
            let image_url: string | null = null

            if (imageFile) {
                const ext = imageFile.name.split(".").pop()
                const path = `${userId}/${Date.now()}.${ext}`
                const { error: uploadError } = await supabase.storage
                    .from("post-images")
                    .upload(path, imageFile, { upsert: true })
                if (uploadError) throw uploadError

                const { data: publicUrlData } = supabase.storage
                    .from("post-images")
                    .getPublicUrl(path)
                image_url = publicUrlData.publicUrl
            }

            const { error } = await supabase
                .from("community_posts")
                .insert({
                    user_id: userId,
                    title: form.title,
                    description: form.description,
                    category: form.category,
                    field: form.field || null,
                    organization: form.organization || null,
                    location: form.location || null,
                    url: form.url || null,
                    deadline: form.deadline || null,
                    qualification: form.qualification,
                    status: "Pending",
                    image_url,
                } as any)

            if (error) throw error

            setSubmitted(true)
            router.refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.")
        } finally {
            setLoading(false)
        }
    }

    function handleClose() {
        setOpen(false)
        setSubmitted(false)
        setForm(EMPTY_FORM)
        setError(null)
        setImageFile(null)
        setImagePreview(null)
    }

    return (
        <>
            <Button onClick={() => setOpen(true)} className="gap-2">
                <Plus className="size-4" />
                Create Post
            </Button>

            <Dialog open={open} onOpenChange={handleClose}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Share an Opportunity</DialogTitle>
                        <DialogDescription>
                            Submit an opportunity to share with the Stuy Connections community.
                            It will be reviewed by an admin before appearing publicly.
                        </DialogDescription>
                    </DialogHeader>

                    {submitted ? (
                        <div className="flex flex-col items-center gap-4 py-8 text-center">
                            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <Check className="size-6 text-primary" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <p className="font-semibold">Post submitted!</p>
                                <p className="text-sm text-muted-foreground">
                                    Your post is pending review. We'll display it once an admin approves it.
                                </p>
                            </div>
                            <Button variant="outline" onClick={handleClose}>Close</Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            {error && (
                                <p className="text-sm text-destructive text-center">{error}</p>
                            )}

                            {/* Image Upload */}
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Image</label>
                                {imagePreview ? (
                                    <div className="relative rounded-lg overflow-hidden border">
                                        <img
                                            src={imagePreview}
                                            alt="Preview"
                                            className="w-full max-h-48 object-cover"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => { setImageFile(null); setImagePreview(null) }}
                                            className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                                        >
                                            <X className="size-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div
                                        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                                        onDragLeave={() => setDragging(false)}
                                        onDrop={handleDrop}
                                        onClick={() => fileInputRef.current?.click()}
                                        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${
                                            dragging
                                                ? "border-primary bg-primary/5"
                                                : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"
                                        }`}
                                    >
                                        <ImagePlus className="size-8 text-muted-foreground" />
                                        <p className="text-sm text-muted-foreground text-center">
                                            Drag & drop an image or <span className="text-primary font-medium">browse</span>
                                        </p>
                                        <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 5MB</p>
                                    </div>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) handleImageSelect(file)
                                    }}
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Title *</label>
                                <Input
                                    placeholder="e.g. Summer Research Internship at Columbia"
                                    value={form.title}
                                    onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">Description *</label>
                                <Textarea
                                    placeholder="Describe the opportunity in detail..."
                                    value={form.description}
                                    onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                                    rows={3}
                                    required
                                />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium">Type *</label>
                                    <select
                                        value={form.category}
                                        onChange={(e) => setForm(f => ({ ...f, category: e.target.value as Category }))}
                                        className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    >
                                        {CATEGORIES.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium">Field</label>
                                    <select
                                        value={form.field}
                                        onChange={(e) => setForm(f => ({ ...f, field: e.target.value }))}
                                        className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    >
                                        <option value="">Select a field</option>
                                        {FIELDS.map(field => (
                                            <option key={field} value={field}>{field}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium">Organization</label>
                                    <Input
                                        placeholder="e.g. Columbia University"
                                        value={form.organization}
                                        onChange={(e) => setForm(f => ({ ...f, organization: e.target.value }))}
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium">Location</label>
                                    <Input
                                        placeholder="e.g. New York, NY"
                                        value={form.location}
                                        onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium">URL</label>
                                    <Input
                                        placeholder="https://..."
                                        value={form.url}
                                        onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))}
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-medium">Deadline</label>
                                    <Input
                                        type="date"
                                        value={form.deadline}
                                        onChange={(e) => setForm(f => ({ ...f, deadline: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium">
                                    Why should this be displayed? *
                                </label>
                                <Textarea
                                    placeholder="Explain why this opportunity is valuable and how it will help the Stuyvesant community..."
                                    value={form.qualification}
                                    onChange={(e) => setForm(f => ({ ...f, qualification: e.target.value }))}
                                    rows={3}
                                    required
                                />
                                <p className="text-xs text-muted-foreground">
                                    This is only visible to admins and helps them review your submission.
                                </p>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button type="submit" disabled={loading} className="flex-1">
                                    {loading ? "Submitting..." : "Submit for Review"}
                                </Button>
                                <Button type="button" variant="outline" onClick={handleClose}>
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}