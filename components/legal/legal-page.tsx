import Link from "next/link"

import { LogoWordmark } from "@/components/brand/logo"
import { siteConfig } from "@/lib/config/site"

export type LegalSection = { title: string; paragraphs: string[] }

export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string
  intro: string
  sections: LegalSection[]
}) {
  return (
    <div className="min-h-svh bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
          <Link href="/login" aria-label="Página inicial">
            <LogoWordmark className="h-6" />
          </Link>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">Versão de {siteConfig.termsVersion}</p>
          <p className="text-muted-foreground">{intro}</p>
        </div>
        {sections.map((section, index) => (
          <section key={section.title} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
              {index + 1}. {section.title}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="leading-relaxed text-foreground/90">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </main>
    </div>
  )
}
