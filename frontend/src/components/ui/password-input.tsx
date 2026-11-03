import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

import { cn } from "../../lib/utils";
import { Input, type InputProps } from "./input";

/** Campo de senha com o cadeado à esquerda e o olho para ver o que foi digitado. */
export function PasswordInput({ className, ...props }: Omit<InputProps, "type">) {
  const [visivel, setVisivel] = useState(false);
  const rotulo = visivel ? "Ocultar senha" : "Mostrar senha";

  return (
    <div className="relative">
      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
      <Input
        type={visivel ? "text" : "password"}
        className={cn("h-11 rounded-xl pl-10 pr-11 text-[14px] font-medium", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisivel((atual) => !atual)}
        aria-label={rotulo}
        title={rotulo}
        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-(--text-muted) transition-colors hover:bg-(--bg-surface-muted) hover:text-(--text-main)"
      >
        {visivel ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
