/**
 * CPF ou CNPJ do cliente, guardado só com dígitos (11 = CPF, 14 = CNPJ).
 * normalizeDocument devolve null quando não tem 11 nem 14 dígitos;
 * isValidDocument confere também os dígitos verificadores.
 */
function normalizeDocument(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 11 || digits.length === 14 ? digits : null;
}

function isValidCpf(cpf) {
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const check = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}

function isValidCnpj(cnpj) {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const check = (length) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, i) => total + Number(cnpj[i]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === Number(cnpj[12]) && check(13) === Number(cnpj[13]);
}

function isValidDocument(value) {
  const digits = normalizeDocument(value);
  if (!digits) return false;
  return digits.length === 11 ? isValidCpf(digits) : isValidCnpj(digits);
}

module.exports = { normalizeDocument, isValidDocument };
