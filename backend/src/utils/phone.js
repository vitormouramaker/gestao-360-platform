/**
 * Telefone do cliente guardado só com dígitos e com o código do país, como o
 * WhatsApp usa: 5511999991234. Número brasileiro sem o 55 (10 ou 11 dígitos,
 * como vem da anamnese ou do cadastro manual) ganha o 55. Devolve null quando
 * não dá para entender o número.
 */
function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
}

module.exports = { normalizePhone };
