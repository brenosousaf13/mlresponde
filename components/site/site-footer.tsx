import { AtSign, Mail, MessageCircle } from "lucide-react"

import { LogoWordmark } from "@/components/brand/logo"
import { companyInfo, siteConfig } from "@/lib/config/site"

import { Pending, whatsappUrl } from "./pending"
import { Container } from "./primitives"
import { SiteButton } from "./site-button"

const YEAR = new Date().getFullYear()

const linkClass = "text-white/60 transition-colors hover:text-white"

export function SiteFooter({ signupHref, loginHref }: { signupHref: string; loginHref: string }) {
  const { cnpj, email, whatsapp, instagram } = companyInfo
  return (
    <footer className="px-3 pt-3 pb-3 sm:px-4 sm:pt-4 sm:pb-4">
      <div className="site-clip rounded-[2rem] bg-brand-graphite text-white sm:rounded-[2.75rem]">
        <Container className="py-16 sm:py-20">
          <div className="flex flex-col gap-8 border-b border-white/10 pb-12 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <LogoWordmark label={siteConfig.name} className="h-9 text-white" />
              <p className="mt-4 max-w-sm text-white/60">{siteConfig.slogan}</p>
            </div>
            <SiteButton href={signupHref} variant="teal" className="shadow-none">
              Testar grátis por {siteConfig.trialDays} dias
            </SiteButton>
          </div>

          <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
            <nav aria-label="Produto">
              <p className="font-medium">Produto</p>
              <ul className="mt-4 flex flex-col gap-3 text-sm">
                <li><a className={linkClass} href="#como-funciona">Como funciona</a></li>
                <li><a className={linkClass} href="#recursos">Recursos</a></li>
                <li><a className={linkClass} href="#calculadora">Calculadora</a></li>
                <li><a className={linkClass} href="#planos">Planos e preços</a></li>
                <li><a className={linkClass} href="#duvidas">Dúvidas frequentes</a></li>
              </ul>
            </nav>
            <nav aria-label="Conta">
              <p className="font-medium">Conta</p>
              <ul className="mt-4 flex flex-col gap-3 text-sm">
                <li><a className={linkClass} href={signupHref}>Criar conta grátis</a></li>
                <li><a className={linkClass} href={loginHref}>Entrar</a></li>
              </ul>
            </nav>
            <nav aria-label="Legal">
              <p className="font-medium">Legal</p>
              <ul className="mt-4 flex flex-col gap-3 text-sm">
                <li><a className={linkClass} href="/termos">Termos de Uso</a></li>
                <li><a className={linkClass} href="/privacidade">Política de Privacidade</a></li>
              </ul>
            </nav>
            <div>
              <p className="font-medium">Contato</p>
              <ul className="mt-4 flex flex-col gap-3 text-sm">
                <li className="flex items-center gap-2">
                  <Mail className="size-4 text-brand-mint" aria-hidden />
                  {email ? (
                    <a className={linkClass} href={`mailto:${email}`}>{email}</a>
                  ) : (
                    <Pending tone="dark">e-mail de contato</Pending>
                  )}
                </li>
                <li className="flex items-center gap-2">
                  <MessageCircle className="size-4 text-brand-mint" aria-hidden />
                  {whatsapp ? (
                    <a className={linkClass} href={whatsappUrl(whatsapp)} target="_blank" rel="noopener noreferrer">
                      WhatsApp
                    </a>
                  ) : (
                    <Pending tone="dark">WhatsApp</Pending>
                  )}
                </li>
                <li className="flex items-center gap-2">
                  <AtSign className="size-4 text-brand-mint" aria-hidden />
                  {instagram ? (
                    <a className={linkClass} href={`https://instagram.com/${instagram}`} target="_blank" rel="noopener noreferrer">
                      @{instagram}
                    </a>
                  ) : (
                    <Pending tone="dark">Instagram</Pending>
                  )}
                </li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-white/10 pt-8 text-xs leading-relaxed text-white/60">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>© {YEAR} {siteConfig.name}</span>
              <span aria-hidden>·</span>
              <span>CNPJ {cnpj}</span>
            </p>
            <p className="max-w-3xl">
              A {siteConfig.name} não é afiliada nem patrocinada pelo Mercado Livre. Mercado Livre é marca de seus respectivos
              donos e é citada apenas para indicar a integração. As respostas automáticas são geradas por inteligência
              artificial a partir das informações dos seus anúncios e das regras que você cadastra.
            </p>
          </div>
        </Container>
      </div>
    </footer>
  )
}
