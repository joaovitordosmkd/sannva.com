@echo off
rem ==========================================================================================
rem  DistribuiPro (versao Firebase) - publica ESTA pasta no Cloudflare pelo Wrangler, como
rem  Cloudflare Pages (endereco .pages.dev, com a pasta functions) ou como Worker (endereco
rem  .workers.dev, com cloudflare\worker.mjs fazendo o papel da functions). Nos dois, o
rem  retrato dos produtos sai so para quem fez login e a pasta data fica fechada. Antes de cada
rem  envio, cloudflare\preparar-retrato.mjs da ao retrato um nome secreto (no Pages o endereco
rem  disfarcado /d%%61ta/... passava pela trava da pasta data).
rem  O arraste pelo painel do Cloudflare nao aceita a pasta functions e da erro.
rem  Uso: dois cliques neste arquivo. Explicacao para o cliente: LEIA-ME-CLOUDFLARE.txt
rem  Textos sem acento de proposito: o Prompt do Windows mostra acento errado em muitos PCs.
rem  Sem "chcp 65001" de proposito: com ele o "set /p" volta vazio (testado), e o Node/Wrangler
rem  ja escreve na tela em Unicode sozinho.
rem ==========================================================================================
setlocal EnableExtensions
title Publicar o sistema no Cloudflare
rem Wrangler 4 pede Node.js 22 ou mais novo
set "NODE_MINIMO=22"
rem guarda "pages nome" ou "worker nome"
set "ARQ_NOME=%~dp0cloudflare-projeto.txt"
set "TENTATIVAS=0"
pushd "%~dp0"

echo.
echo  ============================================================
echo   PUBLICAR O SISTEMA NO CLOUDFLARE
echo  ============================================================
echo.

rem --- 1. Esta e a pasta do sistema? (aberto de dentro do zip, o Windows roda numa pasta vazia)
if not exist "index.html" goto :sem_pasta
if not exist "config\firebase-config.js" goto :sem_pasta
if not exist "functions\" goto :sem_peca
if not exist "cloudflare\worker.mjs" goto :sem_peca
if not exist "cloudflare\wrangler.jsonc" goto :sem_peca
if not exist "cloudflare\preparar-retrato.mjs" goto :sem_peca
if not exist ".assetsignore" goto :sem_peca

rem --- 2. Node.js instalado e novo o bastante?
where node >nul 2>nul
if errorlevel 1 goto :sem_node
where npx >nul 2>nul
if errorlevel 1 goto :sem_node
set "NODE_VER="
for /f "tokens=1 delims=." %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
if not defined NODE_VER goto :sem_node
set "NODE_VER=%NODE_VER:v=%"
set /a NODE_NUM=NODE_VER 2>nul
if not defined NODE_NUM goto :sem_node
if %NODE_NUM% LSS %NODE_MINIMO% goto :node_velho
echo  Node.js encontrado: versao %NODE_VER%.

rem --- 3. Tipo (Pages ou Worker) e nome, guardados em cloudflare-projeto.txt
set "DPTIPO="
set "DPPROJ="
set "NOME_GUARDADO="
set "DPRESTO="
if exist "%ARQ_NOME%" for /f "usebackq tokens=1,2,*" %%a in ("%ARQ_NOME%") do if not defined DPTIPO (set "DPTIPO=%%a" & set "DPPROJ=%%b" & set "DPRESTO=%%c")
if not defined DPTIPO goto :perguntar_tipo
if defined DPRESTO goto :guardado_ruim
call :conferir_tipo
if errorlevel 1 goto :guardado_ruim
if not defined DPPROJ goto :guardado_ruim
call :conferir_nome
if errorlevel 1 goto :guardado_ruim
set "NOME_GUARDADO=1"
goto :nome_ok

:guardado_ruim
echo.
echo  O que esta guardado em cloudflare-projeto.txt nao serve. Vamos perguntar de novo.
set "DPTIPO="
set "DPPROJ="

:perguntar_tipo
echo.
echo  Seu site no Cloudflare e de que tipo? Olhe o endereco dele:
echo    P = termina em .pages.dev    (Cloudflare Pages)
echo    W = termina em .workers.dev  (Worker)
echo   - Usa dominio proprio? No painel do Cloudflare, em "Workers e Pages", abra o site:
echo     o endereco .pages.dev ou .workers.dev aparece la.
echo   - Ainda nao tem site no Cloudflare? Aperte W: o Worker e criado na hora.
echo.
choice /c PW /n /m " Pages ou Worker? [P/W] "
if errorlevel 255 goto :sem_nome
if errorlevel 2 (set "DPTIPO=worker") else (set "DPTIPO=pages")

:perguntar
set /a TENTATIVAS+=1
if %TENTATIVAS% GTR 5 goto :sem_nome
echo.
if "%DPTIPO%"=="worker" goto :pergunta_worker
echo  Qual e o NOME do projeto no Cloudflare Pages?
echo   - E o nome que aparece em dash.cloudflare.com, menu "Workers e Pages".
echo   - E o NOME, nao o endereco: o site minhaloja-abc.pages.dev pode ter o nome minhaloja.
echo   - Ainda nao tem projeto? Digite um nome novo: o Cloudflare cria na hora.
echo   - So letras minusculas, numeros e hifen (-). Sem espaco, sem acento, sem ".pages.dev".
goto :ler_nome
:pergunta_worker
echo  Qual e o NOME do Worker?
echo   - E o comeco do endereco: em loja-abc.minhaconta.workers.dev o nome e loja-abc.
echo     Pode colar o endereco inteiro: o nome sai dele.
echo   - Ainda nao tem Worker? Digite um nome novo (ex.: minhaloja): o Cloudflare cria na hora.
echo   - So letras minusculas, numeros e hifen (-). Sem espaco e sem acento.
:ler_nome
echo.
set "DPPROJ="
set /p "DPPROJ= Nome: "
if not defined DPPROJ goto :perguntar
if "%DPTIPO%"=="worker" call :nome_do_endereco
call :conferir_nome
if errorlevel 1 (
    echo.
    echo  Esse nome nao serve: use so letras, numeros e hifen, sem hifen no comeco ou no fim.
    goto :perguntar
)

:nome_ok
echo.
if "%DPTIPO%"=="worker" (echo  Worker no Cloudflare: %DPPROJ%) else (echo  Projeto no Cloudflare Pages: %DPPROJ%)
if defined NOME_GUARDADO echo  (para mudar, apague o arquivo cloudflare-projeto.txt desta pasta)
echo.
echo  O que vai acontecer agora:
echo   1) Na primeira vez o navegador abre para entrar na sua conta do Cloudflare.
echo      Entre e clique em "Allow" (Permitir) em ate 2 minutos. Depois volte para esta janela.
if "%DPTIPO%"=="worker" goto :aviso_worker
echo   2) Projeto novo: o Cloudflare pergunta "Would you like to create it?".
echo      Aperte Enter em "Create a new project" e Enter de novo em "production branch name".
echo      Se voce JA TEM um projeto e apareceu essa pergunta, o nome esta errado:
echo      feche esta janela e rode de novo com o nome certo.
goto :aviso_fim
:aviso_worker
echo   2) Se aparecer "Would you like to continue?" (o Worker foi mexido pelo painel), responda y.
echo      Se responder n, nada e publicado.
echo      Conta nova pode pedir um endereco workers.dev: responda y e escolha um nome.
:aviso_fim
echo   3) Os arquivos sobem (das proximas vezes, so os que mudaram). Pode levar alguns minutos.
echo.
pause
echo.
rem --- retrato dos produtos com nome secreto (so a function sabe o nome)
node "cloudflare\preparar-retrato.mjs"
if errorlevel 1 goto :sem_preparo
echo.
if "%DPTIPO%"=="worker" (
    call npx --yes wrangler@4 deploy --config cloudflare\wrangler.jsonc --name %DPPROJ%
) else (
    call npx --yes wrangler@4 pages deploy . --project-name %DPPROJ% --commit-dirty=true
)
if errorlevel 1 goto :deu_errado

rem --- deu certo: guarda tipo e nome para a proxima vez
> "%ARQ_NOME%" echo %DPTIPO% %DPPROJ%
echo.
echo  ============================================================
echo   PRONTO! O sistema foi publicado no Cloudflare.
echo  ============================================================
if "%DPTIPO%"=="worker" goto :pronto_worker
echo   - O endereco do site esta no painel do Cloudflare: Workers e Pages, projeto %DPPROJ%
echo     (termina em .pages.dev, ou e o seu dominio). O link "Take a peek over at" acima
echo     e so desta versao: comeca com um codigo e muda a cada publicacao.
goto :pronto_fim
:pronto_worker
echo   - O endereco do site e o que aparece acima terminado em .workers.dev (ou o seu dominio).
echo   - Se respondeu n em alguma pergunta, nada foi publicado: rode de novo e responda y.
:pronto_fim
echo   - Abra o site e aperte Ctrl+F5 para ver a versao nova.
echo   - Mexeu em algo? E so dar dois cliques neste arquivo de novo.
echo.
goto :fim

:deu_errado
echo.
echo  ============================================================
echo   NAO DEU CERTO. O site que ja estava no ar continua como estava.
echo  ============================================================
echo   Veja a mensagem em ingles logo acima (linha com X ou ERROR). O mais comum:
echo   - "Did not login", "Timed out" ou "not logged in": o login nao terminou.
echo       Rode de novo e clique em "Allow" no navegador em ate 2 minutos.
echo   - "Authentication error" ou "not authorized": entrou na conta errada do Cloudflare.
echo       Responda S na pergunta abaixo e rode de novo, entrando na conta certa.
echo   - "fetch failed", "ENOTFOUND", "ETIMEDOUT" ou "ECONNRESET": sem internet ou a rede bloqueou.
echo   - "Missing production branch": na pergunta do branch, aperte so Enter.
echo   - "workers.dev subdomain": a conta ainda nao tem endereco workers.dev. Rode de novo e
echo       responda y quando ele perguntar, ou crie em dash.cloudflare.com, Workers e Pages.
echo   - "20000 files" ou "25 MiB": a pasta tem arquivos demais ou um arquivo com mais de 25 MB
echo       (foto ou backup grande). Tire esse arquivo da pasta e rode de novo.
echo   - Erro em "functions" ou "worker.mjs": a pasta foi mexida. Extraia o zip original de novo.
echo   - Escolheu P ou W errado? Apague o cloudflare-projeto.txt (se existir) e rode de novo.
echo   Nao resolveu? Tire uma foto desta janela e mande para o suporte.
echo.
choice /c SN /n /m " Quer sair da conta do Cloudflare para entrar com outra na proxima vez? [S/N] "
if errorlevel 2 goto :fim_erro
if errorlevel 1 call npx --yes wrangler@4 logout
goto :fim_erro

:sem_preparo
echo.
echo  NAO DEU CERTO: nao consegui preparar o retrato dos produtos (mensagem logo acima).
echo   - Feche programas que estejam com arquivos da pasta "data" abertos e rode de novo.
echo   - Se continuar, extraia de novo o zip original do sistema e rode na pasta nova.
echo  Nada foi enviado.
echo.
goto :fim_erro

:sem_pasta
echo  Este arquivo precisa estar na pasta do sistema, junto do index.html.
echo.
echo   - Se abriu de dentro do zip: feche, clique com o botao direito no zip,
echo     "Extrair tudo", entre na pasta extraida e de dois cliques neste arquivo la.
echo   - Nada foi enviado.
echo.
goto :fim_erro

:sem_peca
echo  Falta uma parte do sistema nesta pasta: a pasta "functions", a pasta "cloudflare"
echo  ou o arquivo ".assetsignore". Sem elas o retrato dos produtos nao funciona e a pasta
echo  "data" (com o preco de custo) pode ficar aberta para quem souber o endereco.
echo.
echo   - Extraia de novo o zip original do sistema (tudo) e de dois cliques neste arquivo
echo     na pasta nova. Nada foi enviado.
echo.
goto :fim_erro

:sem_node
echo  O Node.js nao esta instalado neste computador (ou o Windows ainda nao achou).
echo  Ele e de graca e e o que envia o sistema para o Cloudflare. Instale uma vez so:
echo.
echo   1) Abra https://nodejs.org
echo   2) Baixe a versao "LTS" (botao verde) e instale clicando em Avancar, com tudo padrao.
echo   3) Feche esta janela e de dois cliques neste arquivo de novo.
echo      (Se continuar dizendo que nao esta instalado, reinicie o computador.)
echo.
echo  Nada foi enviado.
echo.
goto :fim_erro

:node_velho
echo  O Node.js deste computador e a versao %NODE_VER%, antiga demais.
echo  O envio para o Cloudflare precisa da versao %NODE_MINIMO% ou mais nova.
echo.
echo   1) Abra https://nodejs.org
echo   2) Baixe a versao "LTS" (botao verde) e instale por cima, com tudo padrao.
echo   3) Feche esta janela e de dois cliques neste arquivo de novo.
echo.
echo  Nada foi enviado.
echo.
goto :fim_erro

:sem_nome
echo.
echo  Nada foi escolhido. Nada foi enviado.
echo.
goto :fim_erro

rem --- confere DPTIPO: so "pages" ou "worker" (minusculo). Sai com 1 se nao serve.
:conferir_tipo
(set DPTIPO)2>nul| findstr /x /i "DPTIPO=pages DPTIPO=worker" >nul
if errorlevel 1 exit /b 1
if /i "%DPTIPO%"=="worker" (set "DPTIPO=worker") else (set "DPTIPO=pages")
exit /b 0

rem --- Worker: aceita o endereco colado (https://nome.conta.workers.dev/...) e fica so com o nome.
rem     So mexe se tiver apenas letras, numeros, ponto, dois-pontos, barra e hifen.
:nome_do_endereco
(set DPPROJ)2>nul| findstr /r /x /i /c:"DPPROJ=[abcdefghijklmnopqrstuvwxyz0123456789.:/-]*" >nul
if errorlevel 1 exit /b 0
set "DPPROJ=%DPPROJ:https://=%"
set "DPPROJ=%DPPROJ:http://=%"
for /f "tokens=1 delims=./" %%a in ("%DPPROJ%") do set "DPPROJ=%%a"
exit /b 0

rem --- confere o nome em DPPROJ: so letras, numeros e hifen, sem hifen nas pontas, ate 58 (Pages)
rem     ou 63 (Worker). Deixa em minusculas. Sai com 1 se nao serve. O "set" entre parenteses e de
rem     proposito: sem eles o espaco antes do "|" entra no nome da variavel e nada casa.
:conferir_nome
(set DPPROJ)2>nul| findstr /r /x /i /c:"DPPROJ=[abcdefghijklmnopqrstuvwxyz0123456789]" /c:"DPPROJ=[abcdefghijklmnopqrstuvwxyz0123456789][abcdefghijklmnopqrstuvwxyz0123456789-]*[abcdefghijklmnopqrstuvwxyz0123456789]" >nul
if errorlevel 1 exit /b 1
for %%L in (a b c d e f g h i j k l m n o p q r s t u v w x y z) do call set "DPPROJ=%%DPPROJ:%%L=%%L%%"
if "%DPTIPO%"=="worker" (set "MAXN=63") else (set "MAXN=58")
set "SOBRA="
call set "SOBRA=%%DPPROJ:~%MAXN%,1%%"
if defined SOBRA exit /b 1
exit /b 0

:fim_erro
popd
pause
endlocal
exit /b 1

:fim
popd
pause
endlocal
exit /b 0
