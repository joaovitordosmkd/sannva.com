<nav class="navbar pull-left">
	<ul class="nav navbar-nav">
		<li class="active"><a href="<?php panel_url(); ?>">Início</a></li>
		<?php if( $_SESSION['estabelecimento']['status'] == "1" ) { ?>
		<li><a href="<?php panel_url(); ?>/pedidos">Pedidos</a></li>
		<li class="dropdown">
			<a class="dropdown-toggle" data-toggle="dropdown" href="#">
				Categorias
				<i class="lni lni-chevron-down icon-right"></i>
			</a>
			<ul class="dropdown-menu">
				<li><a href="<?php panel_url(); ?>/categorias/adicionar"><i class="lni lni-circle-plus"></i> Adicionar nova</a></li>
				<li><a href="<?php panel_url(); ?>/categorias"><i class="lni lni-radio-button"></i> Gerenciar</a></li>
			</ul>
		</li>
		<li class="dropdown">
			<a class="dropdown-toggle" data-toggle="dropdown" href="#">
				Produtos
				<i class="lni lni-chevron-down icon-right"></i>
			</a>
			<ul class="dropdown-menu">
				<li><a href="<?php panel_url(); ?>/produtos/adicionar"><i class="lni lni-circle-plus"></i> Adicionar novo</a></li>
				<li><a href="<?php panel_url(); ?>/produtos"><i class="lni lni-radio-button"></i> Gerenciar</a></li>
			</ul>
		</li>
		<?php if( $_SESSION['estabelecimento']['funcionalidade_banners'] == "1" ) { ?>
		<li class="dropdown">
			<a class="dropdown-toggle" data-toggle="dropdown" href="#">
				Banners
				<i class="lni lni-chevron-down icon-right"></i>
			</a>
			<ul class="dropdown-menu">
				<li><a href="<?php panel_url(); ?>/banners/adicionar"><i class="lni lni-circle-plus"></i> Adicionar novo</a></li>
				<li><a href="<?php panel_url(); ?>/banners"><i class="lni lni-radio-button"></i> Gerenciar</a></li>
			</ul>
		</li>
		<?php } ?>
		<?php } ?>
		<li><a href="<?php panel_url(); ?>/plano">Meu plano</a></li>
		<li class="dropdown">
			<a class="dropdown-toggle" data-toggle="dropdown" href="<?php panel_url(); ?>/configuracoes">
				Mais
				<i class="lni lni-chevron-down icon-right"></i>
			</a>
			<ul class="dropdown-menu">
				<li><a href="<?php panel_url(); ?>/configuracoes"><i class="lni lni-cog"></i> Configurações</a></li>
				<li><a href="<?php panel_url(); ?>/frete"><i class="lni lni-delivery"></i> Delivery</a></li>
				<li><a href="<?php panel_url(); ?>/cupons"><i class="lni lni-ticket"></i> Cupons</a></li>
				<li><a href="<?php panel_url(); ?>/integracao"><i class="lni lni-database"></i> Integração</a></li>
				<li><a href="<?php panel_url(); ?>/relatorio"><i class="lni lni-printer"></i> Relatorio</a></li>
			</ul>
		</li>
		<li><a href="<?php just_url(); ?>/logout">Sair</a></li>
		<!-- <li class="active"><a href="https://api.whatsapp.com/send?text=Aderi a *Catálogo Digital* para ter uma loja virtual para minha empresa integrado com o WhatsApp, cadastre-se você também e teste por 30 dias sem compromisso, venha conhecer essa ferramenta maravilhosa. Eu estou gostando muito, *clique no link:* https://<?php echo $dominio; ?>/comece/?afiliado=<?php echo user_info('email'); ?>">Indique 1 amigo</a></li> -->
		<!--
		<li class="visible-sm visible-xs"><a href="<?php echo $suport_url; ?>" target="_blank">Ajuda</a></li> -->
		
	</ul>
</nav> 

<?php
global $simple_url;
global $httprotocol;
$meudominio = $httprotocol.data_info("estabelecimentos",$_SESSION['estabelecimento']['id'],"subdominio")."." . $simple_url; // $simple_url;
?>

<nav class="navbar pull-right hidden-xs hidden-sm">
	<ul class="nav navbar-nav">
		<li class="active"><a href="<?php echo $meudominio; ?>" target="_blank"><i class="lni lni-home"></i> Ver Loja</a></li>
	</ul>
</nav> 

<div class="clear"></div>