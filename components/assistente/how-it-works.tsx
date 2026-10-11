import { InfoIcon } from "lucide-react"

export function HowItWorks({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-medium">
        <InfoIcon className="size-4 text-primary" />
        {title}
      </p>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-2.5 text-sm text-muted-foreground">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  )
}
