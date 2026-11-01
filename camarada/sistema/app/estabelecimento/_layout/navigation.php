<?php
global $app;
$app_id = $app['id'];

include("../../../_core/_includes/.php");

?>
<nav class="navbar pull-left">
	<ul class="nav navbar-nav">
		<li class="active"><a href="<?php echo $app['url']; ?>"><i class="lni lni-home"></i> Ínicio</a></li>
		<li class="active"><a href="<?php echo $app['url']; ?>/pedidosabertos"><i class="lni lni-radio-button"></i> Pedidos Abertos</a></li>
		<li class="active"><a href="<?php echo $app['url']; ?>/pedidosfechados"><i class="lni lni-radio-button"></i> Pedidos Fechados</a></li>
		<li class="dropdown">
			<a class="dropdown-toggle" data-toggle="dropdown" href="#">
				Categorias
				<i class="lni lni-chevron-down icon-right"></i>
			</a>
			<ul class="dropdown-menu">
				<li><a href="<?php echo $app['url']; ?>/categoria">Todas</a></li>
				<?php
				$query_categoria = 	"SELECT * FROM categorias WHERE rel_estabelecimentos_id = '$app_id' AND visible = '1' AND status = '1' ORDER BY ordem ASC";
				$query_categoria = mysqli_query( $db_con, $query_categoria );
				while ( $data_categoria = mysqli_fetch_array( $query_categoria ) ) {
				?>
				<li><a href="<?php echo $app['url']; ?>/categoria/<?php echo $data_categoria['id']; ?>"><?php echo $data_categoria['nome']; ?></a></li>
				<?php } ?>
			</ul>
		</li>
		<li><a href="<?php echo $app['url']; ?>/categoria?filtro=4"><i class="lni lni-ticket"></i> Ofertas</a></li>
		<li><span class="sidrLeft"><i class="lni lni-restaurant"></i> Informações</span></li>
		
		<?php if ( verifica_horario($app_id) == "disabled" ) { ?>
		
                <li><?php if( data_info( "estabelecimentos", $app['id'], "funcionamento" ) == "1" ) { ?>
                
                        <div class="aberto">
                        
                        <span><button class="verdedesktop">Aberto</button></span>
                        
                        </div>
                        
                        <?php } else { ?>
                        
                        <div class="fechado">
                        
                        <span><button class="vermelhodesktop">Fechado</button></span>
                        
                        </div>
                        
                        <?php } ?>
                
                </li>
		
            <?php } else if ( verifica_horario($app_id) == "open" ) { ?>
                        <li>
						<div class="aberto">

                        <span><button class="verdedesktop">Aberto</button></span>

						</div> 
						</li>
		        <?php } else if ( verifica_horario($app_id) == "close" ) { ?>
                            <li>
                			<div class="fechado">
                
                            <span><button class="vermelhodesktop">Fechado</button></span>
                
                			</div>
                			</li>

				<?php } ?>
		<!-- <li class="visible-sm visible-xs"><a href="#">Suporte</a></li> -->
	</ul>
</nav> 

<nav class="navbar pull-right hidden-xs hidden-sm">
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
		<a href="<?php echo linker( $app['contato_youtube'] ); ?>" target="_blank"><i class="lni lni-map-marker"></i></a>
		<?php } ?>
	</div>
</nav> 

<div class="clear"></div>