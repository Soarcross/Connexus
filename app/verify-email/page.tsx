export default function VerifyEmailPage() {
    return (
        <div className="flex min-h-svh items-center justify-center">
            <div className="text-center flex flex-col gap-2">
                <h1 className="text-2xl font-bold">Check your email</h1>
                <p className="text-muted-foreground text-sm">
                    We sent you a confirmation link. Please check your inbox to activate your account.
                </p>
            </div>
        </div>
    )
}