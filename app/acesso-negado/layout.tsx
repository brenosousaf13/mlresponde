import { AppProviders } from "@/components/providers/app-providers"

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>
}
