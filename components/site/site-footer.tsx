import { AtSign, Mail, MessageCircle } from "lucide-react"

import { companyInfo, siteConfig } from "@/lib/config/site"
import { formatWhatsapp, normalizeWhatsapp } from "@/lib/validation/forms"

import { AuroraWordmark } from "./letters"
import { Container } from "./primitives"
import { SiteButton } from "./site-button"

const YEAR = new Date().getFullYear()

const linkClass = "text-white/60 transition-colors hover:text-white"

/** Conversa no WhatsApp (número com DDI, só dígitos). */
function whatsappUrl(number: string) {
  return `https://wa.me/${number.replace(/\D/g, "")}`
}

export function SiteFooter({ signupHref, loginHref }: { signupHref: string; loginHref: string }) {
  const { cnpj, email, whatsapp, instagram } = companyInfo
  const phone = whatsapp ? formatWhatsapp(normalizeWhatsapp(whatsapp)) : ""
  return (
    <footer data-nav="dark" className="relative overflow-clip bg-brand-night text-white">
      <div aria-hidden className="hero-grid pointer-events-none absolute inset-x-0 top-0 h-[40rem] opacity-60" />
      <Container className="relative max-w-7xl pt-20 sm:pt-28">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-md">
            <p className="font-display text-3xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-4xl">
              Responde. Protege. <span className="text-brand-mint">Recupera.</span>
            </p>
            <p className="mt-4 text-white/60">{siteConfig.slogan}</p>
            <SiteButton href={signupHref} variant="teal" className="mt-8 shadow-none">
              Testar grátis por {siteConfig.trialDays} dias
            </SiteButton>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-10 lg:max-w-3xl lg:grid-cols-4">
            <nav aria-label="Produto" className="col-span-2 sm:col-span-1">
              <p className="font-medium">Produto</p>
              <ul className="mt-4 flex flex-col gap-3 text-sm">
                <li><a className={linkClass} href="#como-funciona">Como funciona</a></li>
                <li><a className={linkClass} href="#recuperar">Recuperador</a></li>
                <li><a className={linkClass} href="#reputacao">Escudo de Reputação</a></li>
                <li><a className={linkClass} href="#recursos">Recursos</a></li>
                <li><a className={linkClass} href="#planos">Planos e preços</a></li>
                <li><a className={linkClass} href="#calculadora">Calculadora</a></li>
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
            <div className="col-span-2 sm:col-span-1">
              <p className="font-medium">Contato</p>
              {/* Só os canais já informados (companyInfo); nada de "a definir" para quem avalia o site. */}
              <ul className="mt-4 flex flex-col gap-3 text-sm">
                {whatsapp && phone ? (
                  <li className="flex items-start gap-2">
                    <MessageCircle className="mt-0.5 size-4 shrink-0 text-brand-mint" aria-hidden />
                    <span className="flex flex-col">
                      <span className="text-white/60">WhatsApp e telefone</span>
                      <a
                        className="font-medium text-white transition-colors hover:text-brand-mint"
                        href={whatsappUrl(whatsapp)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Conversar no WhatsApp: ${phone}`}
                      >
                        {phone}
                      </a>
                    </span>
                  </li>
                ) : null}
                {email ? (
                  <li className="flex items-center gap-2">
                    <Mail className="size-4 shrink-0 text-brand-mint" aria-hidden />
                    <a className={linkClass} href={`mailto:${email}`}>{email}</a>
                  </li>
                ) : null}
                {instagram ? (
                  <li className="flex items-center gap-2">
                    <AtSign className="size-4 shrink-0 text-brand-mint" aria-hidden />
                    <a className={linkClass} href={`https://instagram.com/${instagram}`} target="_blank" rel="noopener noreferrer">
                      @{instagram}
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
        </div>
      </Container>

      {/* A logo gigante: as letras entram subindo, pulam ao passar o mouse e o ponto quica. */}
      <div className="relative mt-20 px-3 sm:mt-28 sm:px-6">
        <AuroraWordmark className="mx-auto max-w-[110rem]" />
      </div>

      <Container className="relative max-w-7xl pt-8 pb-8">
        <div className="flex flex-col gap-4 border-t border-white/10 pt-8 text-xs leading-relaxed text-white/60">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>© {YEAR} {siteConfig.name}</span>
            <span aria-hidden>·</span>
            <span>CNPJ {cnpj}</span>
          </p>
          <p className="max-w-3xl">
            A {siteConfig.name} não é afiliada nem patrocinada pelo Mercado Livre. Mercado Livre é marca de seus respectivos
            donos e é citada apenas para indicar a integração. As respostas automáticas são geradas por inteligência artificial
            a partir das informações dos seus anúncios e das regras que você cadastra. As telas desta página usam dados fictícios
            de uma loja de demonstração.
          </p>
        </div>
      </Container>
    </footer>
  )
}