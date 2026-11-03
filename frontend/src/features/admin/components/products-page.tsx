import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { Field } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import { Card, Page, QueryState } from "../../../components/ui/page";
import type { AdminProduct } from "../../../types/tracking";
import { useAdminAction, useAdminProducts } from "../admin-api";
import { PlanBadge } from "../admin-shared";

/** Link geral de cada entregável externo (Academy, CRM, Imersão Presencial...). */
export function ProductsPage() {
  const query = useAdminProducts();

  return (
    <Page
      title="Entregáveis"
      subtitle="Para onde cada card leva o aluno. Os que funcionam dentro da plataforma não precisam de link. Ingressos individuais ficam na página de cada aluno."
    >
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        errorMessage="Não foi possível carregar os entregáveis."
      />

      {query.data && (
        <Card className="divide-y divide-(--border-subtle) py-2 sm:py-2">
          {query.data.map((product) => (
            <ProductRow key={product.id} product={product} />
          ))}
        </Card>
      )}
    </Page>
  );
}

function ProductRow({ product }: { product: AdminProduct }) {
  const action = useAdminAction();
  const [accessUrl, setAccessUrl] = useState(product.accessUrl || "");
  const changed = accessUrl !== (product.accessUrl || "");
  const fieldId = `entregavel-${product.id}`;

  return (
    <form
      className="grid gap-3 py-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        action.mutate({
          method: "patch",
          path: `/products/${product.id}`,
          body: { accessUrl },
          success: "Link salvo.",
        });
      }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-(--text-main)">{product.name}</p>
          <PlanBadge plan={product.plan} />
        </div>
        {product.description && (
          <p className="mt-1 text-xs text-(--text-muted)">{product.description}</p>
        )}
      </div>

      {product.internal ? (
        <p className="text-sm font-medium text-(--text-muted) lg:col-span-2">
          Funciona dentro da plataforma.
        </p>
      ) : (
        <>
          <Field label="Link" htmlFor={fieldId}>
            <Input
              id={fieldId}
              type="url"
              placeholder="https://"
              value={accessUrl}
              onChange={(event) => setAccessUrl(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="secondary" disabled={!changed || action.isPending}>
            Salvar
          </Button>
        </>
      )}
    </form>
  );
}
