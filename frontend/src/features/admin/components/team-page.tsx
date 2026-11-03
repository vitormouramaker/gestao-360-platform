import { useState } from "react";
import { Copy, KeyRound, Loader2, Pencil, Plus, UserMinus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Field } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Modal } from "../../../components/ui/modal";
import { Card, EmptyState, Page, QueryState } from "../../../components/ui/page";
import { formatDate } from "../../../lib/format";
import { toast } from "../../../store/use-toast-store";
import type { AdminTeamArea, AdminTeamMember } from "../../../types/tracking";
import { useAdminAction, useAdminTeam } from "../admin-api";
import { Badge } from "../admin-shared";

const EMPTY_FORM = { name: "", email: "", permissions: [] as string[] };

/** Nome, e-mail (só ao criar) e as áreas liberadas. */
function AdminFormModal({
  editing,
  areas,
  busy,
  onClose,
  onSubmit,
}: {
  editing: AdminTeamMember | "new";
  areas: AdminTeamArea[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (form: typeof EMPTY_FORM) => void;
}) {
  const isNew = editing === "new";
  const [form, setForm] = useState(() =>
    isNew
      ? EMPTY_FORM
      : { name: editing.name, email: editing.email, permissions: [...editing.permissions] },
  );
  const [error, setError] = useState<string | null>(null);
  const allKeys = areas.map((area) => area.key);

  const toggle = (key: string) => {
    setError(null);
    setForm({
      ...form,
      permissions: form.permissions.includes(key)
        ? form.permissions.filter((item) => item !== key)
        : [...form.permissions, key],
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Informe o nome.");
      return;
    }
    if (isNew && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Informe um e-mail válido.");
      return;
    }
    if (!form.permissions.some((key) => allKeys.includes(key))) {
      setError("Escolha pelo menos uma área.");
      return;
    }
    setError(null);
    onSubmit({ ...form, name: form.name.trim(), email: form.email.trim().toLowerCase() });
  };

  return (
    <Modal
      open
      title={isNew ? "Novo administrador" : `Editar permissões: ${editing.name}`}
      onClose={onClose}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" form="equipe-form" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isNew ? "Criar e enviar acesso" : "Salvar"}
          </Button>
        </>
      }
    >
      <form id="equipe-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" htmlFor="equipe-nome">
            <Input
              id="equipe-nome"
              value={form.name}
              maxLength={255}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </Field>
          <Field label="E-mail" htmlFor="equipe-email">
            <Input
              id="equipe-email"
              type="email"
              autoComplete="off"
              value={form.email}
              maxLength={255}
              disabled={!isNew}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
          </Field>
        </div>

        <fieldset aria-label="Áreas liberadas">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span aria-hidden="true" className="text-[13px] font-bold text-(--text-main)">
              Áreas liberadas
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setError(null);
                  setForm({ ...form, permissions: allKeys });
                }}
              >
                Marcar todas
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, permissions: [] })}>
                Desmarcar todas
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {areas.map((area) => (
              <label
                key={area.key}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-(--border-subtle) p-3"
              >
                <input
                  type="checkbox"
                  checked={form.permissions.includes(area.key)}
                  onChange={() => toggle(area.key)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-(--primary)"
                />
                <span>
                  <span className="block text-sm font-bold text-(--text-main)">{area.label}</span>
                  {area.description && (
                    <span className="block text-xs font-medium text-(--text-muted)">{area.description}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs font-medium text-(--text-muted)">
            A Visão geral fica aberta para toda a equipe. Só o master gerencia a Equipe.
          </p>
        </fieldset>

        {isNew && (
          <p className="rounded-xl bg-(--bg-surface-muted) p-3 text-sm font-medium text-(--text-main)">
            Ele recebe por e-mail um link para criar a própria senha. Você também pode copiar o link e
            mandar por WhatsApp.
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-700">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

/** Link de primeiro acesso: só fica na tela enquanto a janela está aberta. */
function SetupLinkModal({ link, onClose }: { link: { url: string; name: string }; onClose: () => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.", { message: "Selecione o texto e copie." });
    }
  };

  return (
    <Modal
      open
      title="Link de primeiro acesso"
      onClose={onClose}
      footer={<Button onClick={onClose}>Fechar</Button>}
    >
      <div className="space-y-3">
        <p className="text-sm text-(--text-muted)">
          Link para <strong className="text-(--text-main)">{link.name}</strong> criar a senha. Ele
          também foi enviado por e-mail.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            readOnly
            aria-label="Link de primeiro acesso"
            value={link.url}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 basis-64"
          />
          <Button variant="secondary" onClick={() => void copy()}>
            <Copy className="h-4 w-4" />
            Copiar link
          </Button>
        </div>
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          Vale por 7 dias. Quem tiver o link cria a senha desta conta: mande só para a pessoa.
        </p>
      </div>
    </Modal>
  );
}

/** Equipe do /adm: só o master vê. Cria administradores e define o que cada um acessa. */
export function TeamPage() {
  const query = useAdminTeam();
  const action = useAdminAction();
  const [editing, setEditing] = useState<AdminTeamMember | "new" | null>(null);
  const [removing, setRemoving] = useState<AdminTeamMember | null>(null);
  // O link não vai para cache nem armazenamento: some quando a janela fecha.
  const [setupLink, setSetupLink] = useState<{ url: string; name: string } | null>(null);

  const admins = query.data?.admins || [];
  const areas = query.data?.areas || [];
  const areaLabel = (key: string) => areas.find((area) => area.key === key)?.label || key;

  const handleSubmit = async (form: typeof EMPTY_FORM) => {
    if (!editing) return;
    try {
      if (editing === "new") {
        const result = (await action.mutateAsync({
          method: "post",
          path: "/team",
          body: { name: form.name, email: form.email, permissions: form.permissions },
        })) as { setupUrl?: string };
        setEditing(null);
        if (result?.setupUrl) setSetupLink({ url: result.setupUrl, name: form.name });
      } else {
        await action.mutateAsync({
          method: "patch",
          path: `/team/${editing.id}`,
          body: { name: form.name, permissions: form.permissions },
        });
        setEditing(null);
      }
    } catch {
      // O aviso de erro já foi exibido; a janela fica aberta para corrigir.
    }
  };

  const resend = async (admin: AdminTeamMember) => {
    try {
      const result = (await action.mutateAsync({
        method: "post",
        path: `/team/${admin.id}/resend-access`,
      })) as { setupUrl?: string };
      if (result?.setupUrl) setSetupLink({ url: result.setupUrl, name: admin.name });
    } catch {
      // Aviso de erro já exibido.
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await action.mutateAsync({ method: "delete", path: `/team/${removing.id}` });
      setRemoving(null);
    } catch {
      // Aviso de erro já exibido; a janela fica aberta.
    }
  };

  return (
    <Page
      title="Equipe"
      subtitle="Quem da Gestão 360 acessa o painel e quais áreas cada pessoa usa. Só o administrador master vê esta tela."
      actions={
        <Button onClick={() => setEditing("new")} disabled={!query.data}>
          <Plus className="h-4 w-4" />
          Novo administrador
        </Button>
      }
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar a equipe."
      />

      {query.data &&
        (admins.length === 0 ? (
          <EmptyState>Nenhum administrador cadastrado.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {admins.map((admin) => {
              const isMaster = admin.role === "master";
              return (
                <li key={admin.id}>
                  <Card className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-(--text-main)">
                          {admin.name}
                          {admin.isYou && (
                            <span className="ml-1 font-medium text-(--text-muted)">(você)</span>
                          )}
                        </h3>
                        <Badge tone={isMaster ? "success" : "neutral"}>
                          {isMaster ? "Master" : "Administrador"}
                        </Badge>
                        {admin.hasPassword ? (
                          <Badge tone="success">Ativo</Badge>
                        ) : (
                          <Badge tone="warning">Aguardando primeiro acesso</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 break-all text-sm text-(--text-muted)">{admin.email}</p>
                      {!admin.hasPassword && admin.accessSentAt && (
                        <p className="mt-1 text-xs font-medium text-(--text-muted)">
                          Link enviado em {formatDate(admin.accessSentAt)}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {isMaster ? (
                          <span className="rounded-full bg-(--primary)/12 px-2.5 py-1 text-[11px] font-bold text-(--primary-text)">
                            Acesso total
                          </span>
                        ) : admin.permissions.length > 0 ? (
                          admin.permissions.map((key) => (
                            <span
                              key={key}
                              className="rounded-full bg-(--bg-surface-muted) px-2.5 py-1 text-[11px] font-bold text-(--text-main)"
                            >
                              {areaLabel(key)}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs font-medium text-(--text-muted)">
                            Só a Visão geral.
                          </span>
                        )}
                      </div>
                    </div>

                    {!isMaster && !admin.isYou && (
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={action.isPending}
                          onClick={() => setEditing(admin)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar permissões
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={action.isPending}
                          onClick={() => void resend(admin)}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Novo link de acesso
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={action.isPending}
                          onClick={() => setRemoving(admin)}
                          className="hover:text-rose-600"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          Remover acesso
                        </Button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        ))}

      {editing && (
        <AdminFormModal
          key={editing === "new" ? "new" : editing.id}
          editing={editing}
          areas={areas}
          busy={action.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(form) => void handleSubmit(form)}
        />
      )}

      {setupLink && <SetupLinkModal link={setupLink} onClose={() => setSetupLink(null)} />}

      <Modal
        open={removing !== null}
        title="Remover acesso"
        onClose={() => setRemoving(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)} disabled={action.isPending}>
              Manter acesso
            </Button>
            <Button
              onClick={() => void confirmRemove()}
              disabled={action.isPending}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Remover acesso
            </Button>
          </>
        }
      >
        {removing && (
          <p className="text-sm text-(--text-muted)">
            <strong className="text-(--text-main)">{removing.name}</strong> ({removing.email}) deixa de
            conseguir entrar no painel, e as sessões abertas dessa pessoa são encerradas.
          </p>
        )}
      </Modal>
    </Page>
  );
}
