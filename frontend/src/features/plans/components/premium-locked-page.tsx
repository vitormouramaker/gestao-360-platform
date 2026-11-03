import { Lock } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, Page } from "../../../components/ui/page";

interface PremiumLockedPageProps {
  title: string;
  onOpenPremium: () => void;
}

/** Tela de um entregável do Premium aberta por quem está no Essencial. */
export function PremiumLockedPage({ title, onOpenPremium }: PremiumLockedPageProps) {
  return (
    <Page title={title}>
      <Card className="flex flex-col items-start gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-(--bg-surface-muted) text-(--text-main)">
          <Lock className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-(--text-main)">Disponível na Assinatura Anual</h2>
          <p className="mt-1 max-w-xl text-sm text-(--text-muted)">
            {title} faz parte da Assinatura Anual. Veja tudo o que ela acrescenta ao seu programa.
          </p>
        </div>
        <Button size="lg" onClick={onOpenPremium}>
          Conhecer a Assinatura Anual
        </Button>
      </Card>
    </Page>
  );
}
