import { useState } from "react";
import { Check, Copy, Loader2, Plus, Search } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Field, Select } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Modal } from "../../../components/ui/modal";
import { EmptyState, Page, ProgressBar, QueryState } from "../../../components/ui/page";
import { formatDocument, formatPhone } from "../../../lib/format";
import { navigate } from "../../../lib/navigation";
import { toast } from "../../../store/use-toast-store";
import type { PlanId } from "../../../types/catalog";
import { formatPeriod } from "../../checkin/components/checkin-page";
import { useAdminAction, useAdminMembers } from "../admin-api";
import { AccessDeliveryBadge, JourneyBadge, PlanBadge, accessDelivery } from "../admin-shared";
import type { AdminMember } from "../../../types/tracking";

// Plano padrão do cadastro manual: Assinatura Anual (id interno premium), o
// único vendido. O Essencial fica como opção de legado, para casos antigos.
const EMPTY_FORM = { name: "", email: "", phone: "", document: "", plan: "premium" as PlanId, password: "", purchaseDate: "" };

/** Dados de acesso do aluno criado com senha definida pela equipe, para mandar no WhatsApp. */
interface CreatedAccess {
  name: string;
  email: string;
  password: string;
}

/** Endereço da plataforma para o aluno: o mesmo de onde a equipe está (produção ou homologação). */
function platformUrl() {
  return window.location.origin;
}

function accessMessage(access: CreatedAccess) {
  const primeiroNome = access.name.trim().split(" ")[0];
  return [
    `Olá${primeiroNome ? `, ${primeiroNome}` : ""}! Seu acesso ao Gestão 360° está liberado.`,
    "",
    `Link: ${platformUrl()}`,
    `E-mail: ${access.email}`,
    `Senha: ${access.password}`,
  ].join("\n");
}

const ACCESS_FILTERS = {
  todos: "Todos os alunos",
  "nao-entraram": "Não entraram na plataforma",
  "acesso-falhou": "E-mail de acesso falhou",
  "algum-falhou": "Algum e-mail falhou",
} as const;

type AccessFilter = keyof typeof ACCESS_FILTERS;

function matchesAccessFilter(member: AdminMember, filter: AccessFilter) {
  if (filter === "nao-entraram") return accessDelivery(member).key !== "entered";
  if (filter === "acesso-falhou") return accessDelivery(member).key === "failed";
  if (filter === "algum-falhou") return (member.delivery?.failed || 0) > 0;
  return true;
}

/** Todos os alunos com o andamento de cada um. */
export function MembersPage() {
  const query = useAdminMembers();
  const action = useAdminAction();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  // Só vive na tela até o modal ser fechado: a senha não fica guardada em lugar nenhum.
  const [createdAccess, setCreatedAccess] = useState<CreatedAccess | null>(null);
  const [copied, setCopied] = useState(false);

  const [accessFilter, setAccessFilter] = useState<AccessFilter>("todos");

  const termo = search.trim().toLowerCase();
  const members = (query.data || []).filter(
    (member) =>
      (!termo || member.name.toLowerCase().includes(termo) || member.email.toLowerCase().includes(termo) || (Boolean(termo.replace(/\D/g, "")) && ((member.phone || "").includes(termo.replace(/\D/g, "")) || (member.document || "").includes(termo.replace(/\D/g, ""))))) &&
      matchesAccessFilter(member, accessFilter),
  );

  const closeForm = () => {
    setCreating(false);
    setForm(EMPTY_FORM);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await action.mutateAsync({
        method: "post",
        path: "/members",
        body: { ...form, phone: form.phone.replace(/\D/g, ""), document: form.document.replace(/\D/g, "") },
      });
      // Com senha definida, o aluno não recebe o e-mail de criar a senha: a equipe
      // manda os dados de acesso por WhatsApp.
      if (form.password) {
        setCopied(false);
        setCreatedAccess({ name: form.name, email: form.email.trim().toLowerCase(), password: form.password });
      }
      closeForm();
    } catch {
      // O aviso de erro já foi exibido; o formulário fica aberto para corrigir.
    }
  };

  return (
    <Page
      title="Alunos"
      subtitle="Quem compra na Hubla aparece aqui sozinho. Acompanhe em que ponto cada um está."
      actions={
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Novo aluno
        </Button>
      }
    >
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
          <Input
            type="search"
            aria-label="Buscar aluno por nome ou e-mail"
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Filtrar pela entrega do acesso"
          value={accessFilter}
          onChange={(event) => setAccessFilter(event.target.value as AccessFilter)}
          className="w-auto min-w-56"
        >
          {Object.entries(ACCESS_FILTERS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar os alunos."
      />

      {query.data && members.length === 0 && (
        <EmptyState>
          {termo
            ? `Nenhum aluno corresponde a “${search.trim()}”.`
            : accessFilter !== "todos"
              ? "Nenhum aluno nesta situação."
              : "Nenhum aluno cadastrado ainda."}
        </EmptyState>
      )}

      {members.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-(--border-subtle) bg-(--bg-surface)">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead>
              <tr className="border-b border-(--border-subtle) text-xs uppercase tracking-wider text-(--text-muted)">
                <th scope="col" className="px-5 py-3 font-bold">Aluno</th>
                <th scope="col" className="px-5 py-3 font-bold">Plano</th>
                <th scope="col" className="px-5 py-3 font-bold">Situação</th>
                <th scope="col" className="px-5 py-3 font-bold">Acesso</th>
                <th scope="col" className="px-5 py-3 font-bold">Ações do plano</th>
                <th scope="col" className="px-5 py-3 font-bold">Último check-in</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr
                  key={member.id}
                  className="border-b border-(--border-subtle) transition-colors last:border-0 hover:bg-(--bg-surface-muted)"
                >
                  <th scope="row" className="px-5 py-4 font-normal">
                    <button
                      type="button"
                      onClick={() => navigate(`/adm/alunos/${encodeURIComponent(member.id)}`)}
                      className="cursor-pointer text-left"
                    >
                      <span className="block font-bold text-(--text-main) underline-offset-2 hover:underline">
                        {member.name}
                      </span>
                      <span className="block text-xs text-(--text-muted)">{member.email}</span>
                      {member.phone && (
                        <span className="block text-xs text-(--text-muted)">{formatPhone(member.phone)}</span>
                      )}
                    </button>
                  </th>
                  <td className="px-5 py-4">
                    <PlanBadge plan={member.plan} />
                  </td>
                  <td className="px-5 py-4">
                    <JourneyBadge member={member} />
                  </td>
                  <td className="px-5 py-4">
                    <AccessDeliveryBadge member={member} />
                    {(member.delivery?.failed || 0) > 0 && accessDelivery(member).key !== "failed" && (
                      <span className="mt-1 block text-[11px] font-bold text-rose-600">
                        {member.delivery?.failed === 1
                          ? "1 e-mail falhou"
                          : `${member.delivery?.failed} e-mails falharam`}
                      </span>
                    )}
                  </td>
                  <td className="w-44 px-5 py-4">
                    {member.approvedPlan && member.approvedPlan.actionsTotal > 0 ? (
                      <ProgressBar
                        done={member.approvedPlan.actionsDone}
                        total={member.approvedPlan.actionsTotal}
                      />
                    ) : (
                      <span className="text-xs text-(--text-muted)">Sem ações ativas</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-xs text-(--text-muted)">
                    {member.lastCheckin ? (
                      <>
                        <span className="block font-bold text-(--text-main)">
                          {member.lastCheckin.progressLabel}
                        </span>
                        {formatPeriod(member.lastCheckin.period)}
                      </>
                    ) : (
                      "Nenhum"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={creating}
        title="Novo aluno"
        onClose={closeForm}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Cancelar
            </Button>
            <Button type="submit" form="novo-aluno" disabled={action.isPending}>
              {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar aluno
            </Button>
          </>
        }
      >
        <form id="novo-aluno" onSubmit={handleCreate} className="space-y-4">
          <p className="text-sm text-(--text-muted)">
            Use para quem comprou antes da integração com a Hubla ou para liberar um acesso fora
            dela (cortesia, teste, correção). Deixando a senha em branco, a pessoa recebe o mesmo
            e-mail de boas-vindas de quem compra pelo checkout, com o link para criar a senha.
          </p>
          <Field label="Nome" htmlFor="aluno-nome">
            <Input
              id="aluno-nome"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </Field>
          <Field label="E-mail" htmlFor="aluno-email">
            <Input
              id="aluno-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
          </Field>
          <Field label="WhatsApp (opcional)" htmlFor="aluno-whatsapp">
            <Input
              id="aluno-whatsapp"
              type="tel"
              inputMode="tel"
              placeholder="(00) 00000-0000"
              maxLength={15}
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: formatPhone(event.target.value) })}
            />
          </Field>
          <Field label="CPF ou CNPJ (opcional)" htmlFor="aluno-documento">
            <Input
              id="aluno-documento"
              inputMode="numeric"
              placeholder="000.000.000-00"
              maxLength={18}
              value={form.document}
              onChange={(event) => setForm({ ...form, document: formatDocument(event.target.value) })}
            />
          </Field>
          <Field label="Plano" htmlFor="aluno-plano">
            <Select
              id="aluno-plano"
              value={form.plan}
              onChange={(event) => setForm({ ...form, plan: event.target.value as PlanId })}
            >
              <option value="premium">Assinatura Anual</option>
              <option value="essencial">Plano (legado, não vendido)</option>
            </Select>
          </Field>
          <Field
            label="Data da compra (opcional)"
            htmlFor="aluno-compra"
            hint="Para quem comprou fora da integração com a Hubla. A renovação passa a cair no mesmo dia de cada mês, e o aluno recebe o lembrete 3 dias antes."
          >
            <Input
              id="aluno-compra"
              type="date"
              value={form.purchaseDate}
              onChange={(event) => setForm({ ...form, purchaseDate: event.target.value })}
            />
          </Field>
          <Field
            label="Senha (opcional)"
            htmlFor="aluno-senha"
            hint="Deixe em branco para o aluno receber o e-mail de boas-vindas e criar a própria senha."
          >
            <Input
              id="aluno-senha"
              type="text"
              autoComplete="off"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </Field>
        </form>
      </Modal>
      <Modal
        open={Boolean(createdAccess)}
        title="Dados de acesso do aluno"
        onClose={() => setCreatedAccess(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreatedAccess(null)}>
              Fechar
            </Button>
            <Button
              onClick={async () => {
                if (!createdAccess) return;
                try {
                  await navigator.clipboard.writeText(accessMessage(createdAccess));
                  setCopied(true);
                  toast.success("Dados de acesso copiados. Cole no WhatsApp do aluno.");
                } catch {
                  toast.error("Não foi possível copiar.", { message: "Selecione o texto e copie manualmente." });
                }
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado" : "Copiar dados de acesso"}
            </Button>
          </>
        }
      >
        {createdAccess && (
          <div className="space-y-4">
            <p className="text-sm text-(--text-muted)">
              Como a senha foi definida no cadastro, o aluno não recebe o e-mail para criar a senha.
              Copie os dados abaixo e mande no WhatsApp dele. O e-mail de boas-vindas com o passo a
              passo das plataformas foi enviado normalmente.
            </p>
            <dl className="divide-y divide-(--border-subtle) rounded-xl border border-(--border-subtle) text-sm">
              {[
                ["Link da plataforma", platformUrl()],
                ["E-mail", createdAccess.email],
                ["Senha", createdAccess.password],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <dt className="font-medium text-(--text-muted)">{label}</dt>
                  <dd className="select-all break-all font-bold text-(--text-main)">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-(--text-muted)">
              Por segurança, a senha não fica salva: depois de fechar esta janela, ela não aparece de
              novo. Se perder, use "Enviar link de nova senha" na página do aluno.
            </p>
          </div>
        )}
      </Modal>
    </Page>
  );
}
