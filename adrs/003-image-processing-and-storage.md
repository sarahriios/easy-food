# ADR-003 - Processamento e armazenamento de imagens

## Status
Aceita

## Data
11/11/2026

## Responsável
Equipe EasyFood

## Contexto
Usuários e pratos precisam de imagem. É preciso receber o arquivo, garantir que é uma imagem válida, reduzir seu tamanho e guardá-lo de forma que o navegador consiga exibi-lo. O mesmo tratamento vale para a foto de perfil e para a foto do prato.

## Alternativas consideradas
1. Processar e salvar no próprio servidor (Multer + Sharp + disco local)
2. Multer + Sharp e enviar o resultado para um armazenamento de objetos (S3 ou similar)
3. Upload direto do navegador para o armazenamento, com função serverless (FaaS) gerando as versões otimizadas
4. Salvar a imagem em bytes no PostgreSQL

## Decisão
Alternativa 1: Multer (memória, 5 MB, JPEG/PNG/WebP) + Sharp (WebP, redimensionamento) + disco local servido em `/uploads`. Toda a lógica fica em `src/modules/shared/image.service.js`, usado por auth e dishes. No banco guarda-se apenas o **caminho** da imagem.

## Justificativa
- Menor complexidade e nenhum custo de infraestrutura para esta fase.
- O serviço compartilhado isola a decisão: trocar o disco por S3, ou o processamento por FaaS, altera um único arquivo.
- Guardar o caminho (e não os bytes) mantém o banco leve e rápido.
- WebP reduz o tamanho sem perda perceptível.

## Consequências

### Positivas
- Implementação simples, testável e reutilizável.
- Imagens otimizadas, nomes gerados no servidor (sem path traversal), arquivo antigo removido ao trocar.

### Negativas
- Disco local não é compartilhado entre várias instâncias nem sobrevive a um deploy que recria o servidor.
- O processamento (CPU) acontece dentro da requisição e pode ficar lento em picos.
- Sem CDN, o servidor da API também entrega as imagens.
- Não há varredura de vírus nem moderação de conteúdo.

## Critérios de revisão
Reavaliar quando:
1. Houver mais de uma instância da API ou deploy em ambiente efêmero (migrar para armazenamento de objetos).
2. O volume de uploads sobrecarregar a CPU (mover o processamento para fila/FaaS).
3. Houver necessidade de várias resoluções por imagem ou CDN.
4. Surgir requisito de moderação de conteúdo.
