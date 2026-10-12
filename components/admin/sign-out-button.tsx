"use client"

import { LogOutIcon } from "lucide-react"
import { useTransition } from "react"

import { signOut } from "@/app/(auth)/actions"
import { cn } from "@/lib/utils"

export function SignOutButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => signOut())}
      className={cn("inline-flex items-center gap-1 hover:text-foreground hover:underline disabled:opacity-50", className)}
    >
      <LogOutIcon className="size-3.5" />
      Sair
    </button>
  )
}
