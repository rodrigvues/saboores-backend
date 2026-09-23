/**
 * Aviso one-off aos organizadores cujas rodadas perderam a taxa fixa na migração
 * para taxa percentual. Lê o CSV de conferência (COPY ... WITH CSV HEADER),
 * filtra as rodadas com `efeito_da_migracao = 'TAXA SERA DESLIGADA'` e envia um
 * e-mail por organizador. Descartável: rode uma vez e apague o CSV depois.
 *
 * Uso: npx tsx scripts/avisa-taxa-percentual.ts docs-local/conferencia-taxa-<data>.csv
 */
import { readFileSync } from "node:fs";
// `EmailService.send` é `private`; o transporte direto é a saída de fora do src.
import { gmailProvider } from "../src/lib/email/gmail.provider.js";

type Row = Record<string, string>;

/** Parser de CSV com aspas duplas (formato do COPY ... WITH CSV HEADER). */
function parseCsv(content: string): Row[] {
  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && content[i + 1] === "\n") i += 1;
      record.push(field);
      field = "";
      if (record.length > 1 || record[0] !== "") rows.push(record);
      record = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    rows.push(record);
  }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((cols) => {
    const row: Row = {};
    header.forEach((key, idx) => (row[key] = cols[idx] ?? ""));
    return row;
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Uso: npx tsx scripts/avisa-taxa-percentual.ts <arquivo.csv>");
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(csvPath, "utf8")).filter(
    (row) => row["efeito_da_migracao"] === "TAXA SERA DESLIGADA",
  );

  const byOrganizer = new Map<string, { nome: string; rodadas: Row[] }>();
  for (const row of rows) {
    const email = row["organizador_email"];
    const entry = byOrganizer.get(email) ?? { nome: row["organizador_nome"], rodadas: [] };
    entry.rodadas.push(row);
    byOrganizer.set(email, entry);
  }

  for (const [email, { nome, rodadas }] of byOrganizer) {
    const lista = rodadas
      .map((r) => `- ${r["name"]} (termina em ${formatDate(r["endsAt"])})`)
      .join("\n");
    const text = [
      `Olá, ${nome}!`,
      "",
      "A taxa de serviço das rodadas de encomenda mudou: antes era um valor fixo por pedido, agora é uma",
      "porcentagem do subtotal. Quanto maior o pedido, maior a taxa.",
      "",
      "Como não dá para transformar um valor fixo em porcentagem sem chutar, desligamos a taxa das suas",
      "rodadas abertas para não cobrar nada errado de ninguém:",
      "",
      lista,
      "",
      "Entre no painel e defina o percentual em cada uma. Os pedidos já feitos continuam com o valor que foi",
      "combinado na hora, nada mudou para quem já pediu.",
    ].join("\n");
    const listaHtml = rodadas
      .map((r) => `<li>${r["name"]} (termina em ${formatDate(r["endsAt"])})</li>`)
      .join("");
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2933;">
        <p>Olá, <strong>${nome}</strong>!</p>
        <p>A taxa de serviço das rodadas de encomenda mudou: antes era um valor fixo por pedido, agora é
          uma porcentagem do subtotal. Quanto maior o pedido, maior a taxa.</p>
        <p>Como não dá para transformar um valor fixo em porcentagem sem chutar, desligamos a taxa das
          suas rodadas abertas para não cobrar nada errado de ninguém:</p>
        <ul style="color:#e8590c;">${listaHtml}</ul>
        <p>Entre no painel e defina o percentual em cada uma. Os pedidos já feitos continuam com o valor
          que foi combinado na hora, nada mudou para quem já pediu.</p>
      </div>
    `;

    await gmailProvider.send({
      to: email,
      subject: "A taxa de serviço agora é percentual",
      html,
      text,
    });
    console.log(`avisado: ${email} (${rodadas.length} rodada(s))`);
  }

  console.log(`\n${byOrganizer.size} organizador(es) avisado(s). ✅`);
}

main().catch((err) => {
  console.error("Falha no aviso:", err);
  process.exit(1);
});
