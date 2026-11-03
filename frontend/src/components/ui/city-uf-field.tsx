import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { cn } from "../../lib/utils";
import { Select } from "./field";
import { Input } from "./input";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

/**
 * Separa "Campinas/SP" em cidade e UF. Textos antigos, digitados à mão
 * ("Campinas - SP", "Campinas, SP"), também são entendidos; sem UF reconhecida,
 * o texto inteiro fica como cidade.
 */
export function parseCityUf(value: string) {
  const match = /^(.*)\/([A-Z]{2})$/.exec(value) || /^(.*?)\s*[-–,/]\s*([A-Z]{2})$/.exec(value);
  if (match && UFS.includes(match[2])) return { city: match[1], uf: match[2] };
  return { city: value, uf: "" };
}

// Tempo máximo de cada tentativa de carregar a lista de cidades. Passou disso,
// a próxima tentativa entra; sem nenhuma, o campo vira texto para digitar.
const CITIES_TIMEOUT_MS = 6000;

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Tempo esgotado.")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Municípios da UF. A lista fica no próprio 360 (src/data/municipios.json,
 * gerada a partir do IBGE e carregada só quando o campo aparece); a API do
 * IBGE é só o plano B. Cada tentativa tem tempo limite.
 */
async function fetchCities(uf: string) {
  try {
    const { default: local } = await withTimeout(import("../../data/municipios.json"), CITIES_TIMEOUT_MS);
    const cities = (local as Record<string, string[]>)[uf];
    if (Array.isArray(cities) && cities.length > 0) return cities;
  } catch {
    // Segue para o IBGE.
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), CITIES_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`,
      { signal: controller.signal },
    );
    if (!response.ok) throw new Error("Lista de cidades indisponível.");
    const data = (await response.json()) as Array<{ nome: string }>;
    if (!Array.isArray(data) || data.length === 0) throw new Error("Lista de cidades vazia.");
    return data.map((item) => item.nome);
  } finally {
    window.clearTimeout(timer);
  }
}

interface CityUfFieldProps {
  /** Id do seletor de UF: é ele que recebe o foco e o rótulo do campo. */
  id: string;
  /** Um texto só, no formato "Cidade/UF". */
  value: string;
  onChange: (value: string) => void;
  /** Classes dos dois controles (ex.: altura). */
  className?: string;
}

/**
 * Cidade e UF em dois seletores, guardados como um texto só ("Campinas/SP").
 * As cidades vêm da lista guardada no 360 (com a API do IBGE de reserva); se
 * nenhuma responder a tempo, a cidade vira campo de texto para o formulário
 * nunca travar.
 */
export function CityUfField({ id, value, onChange, className }: CityUfFieldProps) {
  const parsed = parseCityUf(value);
  // UF escolhida antes da cidade: ainda não cabe no valor, fica só na tela.
  const [pendingUf, setPendingUf] = useState("");
  const uf = parsed.uf || pendingUf;
  const city = parsed.city;

  const query = useQuery({
    queryKey: ["ibge-cities", uf],
    queryFn: () => fetchCities(uf),
    enabled: Boolean(uf),
    staleTime: Infinity,
    // As duas fontes já foram tentadas, cada uma com tempo limite: falhou, é texto livre.
    retry: false,
  });

  const changeUf = (next: string) => {
    setPendingUf(next);
    // Texto antigo sem UF: a cidade digitada é mantida. Trocando de UF, a cidade recomeça.
    onChange(next && !uf && city.trim() ? `${city.trim()}/${next}` : "");
  };

  const changeCity = (next: string) => {
    setPendingUf(uf);
    onChange(uf && next ? `${next}/${uf}` : next);
  };

  const cityId = `${id}-cidade`;
  // Sem UF só existe texto quando o valor é antigo; com UF, quando o IBGE falhou.
  const freeText = uf ? query.isError : Boolean(city);
  const cities = query.data || [];
  const listed = cities.find((name) => name.toLowerCase() === city.trim().toLowerCase());

  return (
    <div>
      <div className="flex gap-2">
        <Select
          id={id}
          aria-label="UF"
          value={uf}
          onChange={(event) => changeUf(event.target.value)}
          className={cn("w-24 shrink-0", className)}
        >
          <option value="">UF</option>
          {UFS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>

        {freeText ? (
          <Input
            id={cityId}
            aria-label="Cidade"
            placeholder="Cidade"
            value={city}
            maxLength={150}
            onChange={(event) => changeCity(event.target.value)}
            onBlur={() => city !== city.trim() && changeCity(city.trim())}
            className={className}
          />
        ) : (
          <Select
            id={cityId}
            aria-label="Cidade"
            value={listed ?? city}
            disabled={!uf || query.isPending}
            onChange={(event) => changeCity(event.target.value)}
            className={className}
          >
            <option value="">
              {!uf ? "Escolha a UF primeiro" : query.isPending ? "Carregando cidades..." : "Escolha a cidade"}
            </option>
            {/* Cidade já gravada que não está na lista do IBGE continua aparecendo. */}
            {city.trim() && !listed && <option value={city}>{city}</option>}
            {cities.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {uf && query.isError && (
        <p className="mt-1.5 text-xs font-medium text-(--text-muted)">
          Não deu para carregar a lista de cidades. Digite o nome da cidade.
        </p>
      )}
    </div>
  );
}
