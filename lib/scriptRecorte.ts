// Script do Google Apps Script que leva o e-mail diário do Recorte Digital do Gmail para o Órion.
// Mostrado em Integrações (com o endereço e a senha já preenchidos) e explicado em docs/recorte-digital.md.
export function scriptRecorte(url: string, token: string) {
  return `// Órion CRM · Recorte Digital (OAB/ES) → Publicações
// Leva para o Órion os e-mails do Recorte Digital que chegam a este Gmail.
// Primeira vez: rode a função "instalar" (menu acima: escolha "instalar" e clique em Executar).

const ORION_URL = "${url}";
const ORION_TOKEN = "${token}";
const ROTULO = "Orion-Recorte";

function importarRecorte() {
  const rotulo = GmailApp.getUserLabelByName(ROTULO) || GmailApp.createLabel(ROTULO);
  const conversas = GmailApp.search('from:oabes@recortedigital.adv.br subject:"Public." newer_than:15d -label:' + ROTULO, 0, 50);
  conversas.forEach(function (conversa) {
    conversa.getMessages().forEach(function (m) {
      if (m.getFrom().indexOf("recortedigital") < 0) return;
      const r = UrlFetchApp.fetch(ORION_URL, {
        method: "post",
        contentType: "application/json",
        headers: { "x-orion-token": ORION_TOKEN },
        payload: JSON.stringify({ assunto: m.getSubject(), data: m.getDate().toISOString(), html: m.getBody() }),
        muteHttpExceptions: true,
      });
      if (r.getResponseCode() !== 200) throw new Error("O Órion respondeu " + r.getResponseCode() + ": " + r.getContentText().slice(0, 300));
    });
    conversa.addLabel(rotulo); // marca como levado, para não mandar de novo
  });
}

// Liga a execução automática de hora em hora e já faz a primeira importação (últimos 15 dias).
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("importarRecorte").timeBased().everyHours(1).create();
  importarRecorte();
}
`;
}
