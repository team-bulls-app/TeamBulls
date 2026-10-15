# Avisos de feedback no celular

O app apresenta ao aluno, somente no celular, um botão para autorizar notificações. Enquanto o app está aberto, novos feedbacks aparecem na barra do sistema após a permissão. A função `notifyNewFeedback` entrega o mesmo aviso quando o app está em segundo plano ou fechado. O título segue uma das cinco categorias de feedback; o corpo do feedback não é enviado ao serviço de push. O som é controlado pelo sistema operacional do aparelho.

Para ativar a entrega com o app fechado no projeto `teamms-app`, escolha **um** serviço de envio:

- **Cloudflare Workers Free, sem Blaze:** siga [cloudflare-feedback-push.md](cloudflare-feedback-push.md). O Worker lê somente os campos necessários dos novos feedbacks, confere novamente o vínculo do aluno e envia o aviso pelo FCM. Requer conta Cloudflare gratuita, uma chave de serviço Google guardada como segredo no Worker e uma chave Web Push pública no app.
- **Firebase Cloud Functions, com Blaze:** siga os passos abaixo. Não publique esta função ao usar o Worker, pois os dois serviços enviariam avisos duplicados.

Para o caminho Cloud Functions:

1. Mudar o projeto Firebase de Spark para Blaze. O Firebase exige Blaze para publicar Cloud Functions; isso pode gerar cobranças conforme o uso. Configure um limite de gastos antes da publicação.
2. Em Configurações do projeto → Cloud Messaging → Certificados push da Web, gerar o par de chaves Web Push. Copiar **somente a chave pública** para `webPushVapidKey` em `config_v10_7.js`. A chave privada permanece no Firebase.
3. Publicar as regras atualizadas de `firebase/firestore_28_compacto.rules` antes de disponibilizar o botão aos alunos. Elas mantêm App Check e o isolamento por aluno, permitem apenas cancelar pedidos ainda sem resposta e registrar o token do próprio aparelho.
4. Na pasta `functions`, executar `npm ci`. Publicar `notifyNewFeedback` com a Firebase CLI no projeto correto, por exemplo `firebase deploy --config firebase.push.json --only functions:notifyNewFeedback --project teamms-app`. O `firebase.json` principal continua independente da função para que a publicação das regras não tente cobrar ou publicar push antes da hora.
5. Em um Android e, separadamente, em um iPhone com o app adicionado à Tela de Início, autorizar avisos, enviar um feedback de teste e verificar a barra com o app aberto e fechado. Rejeitar a permissão e sair da conta devem impedir novos avisos naquele aparelho.

Sem um dos serviços de envio publicado ou sem a chave pública Web Push, a interface permanece funcional e o aviso do aparelho funciona enquanto o app está aberto, mas não há entrega com o app fechado. O desktop não pede permissão.
