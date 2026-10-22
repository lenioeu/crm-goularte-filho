import type { Metadata } from "next";
import Link from "next/link";
import { Marca } from "@/components/Marca";

export const metadata: Metadata = { title: "Política de Privacidade · Órion CRM" };

const CONTATO = "contato@goulartefilho.app";

export default function Privacidade() {
  return (
    <main className="doc">
      <div className="doc-topo"><Marca /></div>
      <article className="card">
        <h1>Política de Privacidade</h1>
        <p className="data">Última atualização: 23 de outubro de 2026</p>

        <h2>1. Quem somos</h2>
        <p>
          Esta política se aplica ao <b>Órion CRM</b>, sistema interno do escritório <b>Goularte Filho Advocacia</b>,
          disponível em crm.goulartefilho.app. O escritório é o controlador dos dados pessoais tratados no sistema, nos
          termos da Lei Geral de Proteção de Dados (Lei 13.709/2018).
        </p>

        <h2>2. Quais dados tratamos</h2>
        <ul>
          <li><b>Da equipe do escritório:</b> nome, e-mail, cargo, telefone e inscrição na OAB, para controle de acesso.</li>
          <li>
            <b>De clientes e pessoas que procuram o escritório:</b> nome, telefone, e-mail, CPF ou CNPJ, informações do caso,
            mensagens trocadas com o escritório e documentos enviados por elas.
          </li>
        </ul>

        <h2>3. Para que usamos</h2>
        <p>
          Para prestar os serviços advocatícios contratados ou solicitados: atendimento, análise de viabilidade, organização
          de documentos, acompanhamento de processos e audiências e envio de lembretes. As bases legais são a execução de
          contrato e de procedimentos preliminares, o exercício regular de direitos em processo e o cumprimento de
          obrigações legais e regulatórias, inclusive do Estatuto e do Código de Ética da OAB.
        </p>

        <h2>4. Dados das contas Google</h2>
        <p>
          Com a autorização do titular da conta Google do escritório, o Órion CRM acessa:
        </p>
        <ul>
          <li>
            <b>Google Drive:</b> para localizar e criar as pastas dos clientes dentro da pasta do escritório e salvar nelas os
            documentos recebidos dos clientes.
          </li>
          <li><b>Google Agenda:</b> para criar, alterar e excluir os eventos das audiências do escritório.</li>
        </ul>
        <p>
          Esses dados são usados exclusivamente para as funções acima, dentro do próprio sistema. Não são vendidos, não são
          usados para publicidade, não são usados para treinar modelos de inteligência artificial e não são compartilhados
          com terceiros, salvo obrigação legal. O uso e a transferência, pelo Órion CRM, de informações recebidas das APIs do
          Google seguem a{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener">
            Política de Dados do Usuário dos Serviços de API do Google
          </a>
          , incluindo os requisitos de Uso Limitado.
        </p>

        <h2>5. Onde os dados ficam</h2>
        <p>
          Os dados ficam armazenados em provedores de nuvem contratados pelo escritório: Supabase (banco de dados), Vercel
          (hospedagem do sistema) e Google (Drive e Agenda do escritório). O acesso é restrito à equipe autorizada, com
          permissões por função, e casos sigilosos ficam visíveis apenas ao administrador e ao advogado responsável.
        </p>

        <h2>6. Por quanto tempo</h2>
        <p>
          Pelo tempo necessário à prestação do serviço e, depois disso, pelos prazos exigidos em lei ou necessários à defesa
          de direitos do escritório e dos clientes.
        </p>

        <h2>7. Seus direitos</h2>
        <p>
          Você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade ou eliminação dos seus
          dados, além de informações sobre compartilhamento, nos termos do art. 18 da LGPD. O titular da conta Google do
          escritório pode revogar o acesso do sistema a qualquer momento em{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</a>.
        </p>

        <h2>8. Contato</h2>
        <p>
          Pedidos e dúvidas sobre esta política: <b>{CONTATO}</b>.
        </p>

        <p style={{ marginTop: 24 }}>
          <Link href="/sobre">Sobre o Órion CRM</Link>
        </p>
      </article>
    </main>
  );
}
