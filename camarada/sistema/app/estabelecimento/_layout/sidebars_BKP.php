<?php
global $app;
$pegaurlx =  "https://$_SERVER[HTTP_HOST]$_SERVER[REQUEST_URI]";
?>

<div class="sidebars">
    
	<div id="sidebarLeft">

		<div class="sidebar">

			<div class="sidebar-header">
				<i class="close-sidebar lni lni-close" onclick="$.sidr('close', 'sidrLeft');"></i>
				<div class="clear"></div>
			</div>

			<div class="sidebar-content">
			    
			    <div class="row">
				<div class="col-md-12">
					
					
<div style="display: flex; justify-content: center;">
    <button id="installButton" style="background: #ededed; margin: 5px;">
        <i class="lni lni-android" style="color: #36b305;"></i> Instalar APP
    </button>
    <button id="showInstructionsButton" style="background: #ededed; margin: 5px;">
        <i class="lni lni-apple" style="color: black;"></i> Instalar APP
    </button>
</div>

<div id="instructionsPopup" class="popup" style="display: none;">
    <div class="popup-content">
        <h2>📱 Instruções para iOS</h2>
        <p>Para adicionar este site na tela inicial no dispositivo iOS, siga estas etapas:</p>
        <ol>
            <li>🌍 Abra o Safari no seu iOS.</li>
            <li>🌐 Navegue até o site que deseja adicionar.</li>
            <li>📤 Toque no ícone de compartilhar no canto inferior da tela.</li>
            <li>📲 Role a lista de opções para baixo e selecione "Adicionar à Tela de Início".</li>
            <li>✔️ Siga as instruções na tela para criar um atalho.</li>
        </ol>
    </div>
    <button id="closePopupButton" style="background: #ededed;">Fechar</button>
</div>

<script>
    let deferredPrompt;

    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevenir a exibição automática do prompt
        e.preventDefault();

        // Armazenar o evento para usar mais tarde
        deferredPrompt = e;

        // Mostrar o botão de instalação
        const installButton = document.getElementById('installButton');
        installButton.style.display = 'block';

        installButton.addEventListener('click', async () => {
            // Mostrar o prompt de instalação
            deferredPrompt.prompt();

            // Esperar pela resposta do usuário
            const { outcome } = await deferredPrompt.userChoice;

            // Esconder o botão após a escolha do usuário
            if (outcome === 'accepted') {
                console.log('Usuário aceitou a instalação do PWA');
            } else {
                console.log('Usuário recusou a instalação do PWA');
            }

            deferredPrompt = null;
        });
    });

    // Fechar as instruções do iOS
    document.getElementById('closePopupButton').addEventListener('click', () => {
        document.getElementById('instructionsPopup').style.display = 'none';
    });

    const showInstructionsButton = document.getElementById('showInstructionsButton');
    const instructionsPopup = document.getElementById('instructionsPopup');

    showInstructionsButton.addEventListener('click', () => {
        instructionsPopup.style.display = 'block';
    });
</script>
                    </span>
				</div>
			</div>
			
<div class="container nopadd visible-xs visible-sm">

		<div class="app-infos" style="margin: 0 !important; padding: 0 !important">
			
			 <div class="row">
				<div class="col-md-12">
					<div class="info-badges flex">
						<?php if( $app['pedido_minimo'] ) { ?>
						<div class="info-badge">
							<i class="lni lni-money-protection"></i> 
							<span>
								Pedido minímo:<br/>
								<?php echo $app['pedido_minimo']; ?>
							</span>
							<div class="clear"></div>
						</div>
						<?php } ?>
						
						 
						<div class="info-badge">
							<i class="lni lni-whatsapp"></i>
							<span><a href="https://api.whatsapp.com/send?text=*Abre%20ai*%20e%20confere%20essa%20novidade.%20%20<?php print $pegaurlx; ?>" target="_blank">
							
								Compartilhe<br/>
								nossa loja
							</a></span>
							
							<div class="clear"></div>
						</div>
					</div>
				</div>
			</div>	
			
		</div>

	</div>
			    <div class="sidebar-info">

					<div class="title">
						<i class="lni lni-cart-full"></i>
						<span>Meus Pedidos</span>
					</div>

					<div class="content">
						<a href="./pedidosabertos"><i class="lni lni-shift-right"></i> Abertos</a>
					</div>
					
					<div class="content">
						<a href="./pedidosfechados"><i class="lni lni-shift-right"></i> Finalizados</a>
					</div>

				</div>

				<div class="sidebar-info">

					<div class="title">
						<i class="lni lni-alarm-clock"></i>
						<span>Funcionamento</span>
					</div>

					<div class="content">
						<?php echo $app['horario_funcionamento']; ?>
					</div>

				</div>

				<div class="sidebar-info">

					<div class="title">
						<i class="lni lni-map-marker"></i>
						<span>Endereço</span>
					</div>
					
					<div style="text-align: center;">
					        					<a target="_blank" style="color: #333;" href="<?php echo linker( $app['contato_youtube'] ); ?>" class="botao-acao botao-acao-gray"><i class="lni lni-map-marker"></i> Como Chegar</a>
    					 					</div>

					<div class="content">
						<?php echo $app['endereco_completo']; ?>
					</div>

				</div>

				<div class="sidebar-info">

					<div class="title">
						<i class="lni lni-headphone-alt"></i>
						<span>Contato</span>
					</div>

					<div class="content">
						<div class="listitem">
							<i class="lni lni-whatsapp"></i>
							<span><?php echo $app['contato_whatsapp']; ?></span>
						</div>
						<?php if( $app['contato_email'] ) { ?>
						<div class="listitem">
							<i class="lni lni-envelope"></i>
							<span><?php echo $app['contato_email']; ?></span>
						</div>
						<?php } ?>
					</div>

					<div class="social">
						<?php if( $app['contato_whatsapp'] ) { ?>
						<a href="https://wa.me/55<?php echo $app['contato_whatsapp']; ?>" target="_blank"><i class="lni lni-whatsapp"></i></a>
						<?php } ?>
						<?php if( $app['contato_facebook'] ) { ?>
						<a href="<?php echo linker( $app['contato_facebook'] ); ?>" target="_blank"><i class="lni lni-facebook-filled"></i></a>
						<?php } ?>
						<?php if( $app['contato_instagram'] ) { ?>
						<a href="<?php echo linker( $app['contato_instagram'] ); ?>" target="_blank"><i class="lni lni-instagram-original"></i></a>
						<?php } ?>
						<?php if( $app['contato_youtube'] ) { ?>
						<a href="<?php echo linker( $app['contato_youtube'] ); ?>" target="_blank"><i class="lni lni-youtube"></i></a>
						<?php } ?>
					</div>

				</div>

			</div>

		</div>

	</div>

</div>