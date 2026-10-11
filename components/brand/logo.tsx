import Image from "next/image"

import { cn } from "@/lib/utils"
import { siteConfig } from "@/lib/config/site"

export function LogoWordmark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/logo-wordmark.png"
      alt={siteConfig.name}
      width={1147}
      height={181}
      priority
      className={cn("h-7 w-auto", className)}
    />
  )
}

export function LogoIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/logo-icon.png"
      alt=""
      width={153}
      height={153}
      className={cn("size-8", className)}
    />
  )
}
