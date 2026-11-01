<?php
// CORE
include($virtualpath.'/_layout/define.php');
// APP
global $app;
global $seo_title;
// SEO
$seo_subtitle = $app['title']."-".$app['uf'];
$seo_description = $app['title'];
$seo_keywords = $app['title'].", ".$seo_title;
$seo_image = get_just_url()."/_core/_cdn/img/favicon.png";
// HEADER
$system_header .= "";
include($virtualpath.'/_layout/head.php');
include($virtualpath.'/_layout/top.php');
include($virtualpath.'/_layout/sidebars.php');
include($virtualpath.'/_layout/modal.php');
instantrender();
?>

				<?php
				$eid = $app['id'];
				$query_banners = mysqli_query( $db_con, "SELECT * FROM banners_marketplace WHERE rel_estabelecimentos_id = '1' AND status = '1' ORDER BY id DESC LIMIT 8" );
				$has_banners = mysqli_num_rows( $query_banners );
				if( $has_banners ) {
				?>

				<div class="banners-marketplace">

					<div id="carouselbanners" class="carousel slide">

						<div class="carousel-inner">
						    
							<?php
							$actual = 0;
							while ( $data_banners = mysqli_fetch_array( $query_banners ) ) {
							    $banner_video_link = $data_banners['video_link'];
    							$desktop = $data_banners['desktop'];
    							$mobile = $data_banners['mobile'];
    							if( !$mobile ) {
    								$mobile = $desktop;
    							}
    							?>
    
    							<div class="item <?php if( $actual == 0 ) { echo 'active'; }; ?>">
    
    								<?php if( $data_banners['link'] ) { ?>
    								<a href="<?php echo linker( $data_banners['link'] ); ?>">
    								<?php } ?>
    
    									<img class="hidden-xs hidden-sm" src="<?php echo imager( $desktop ); ?>" style="margin: auto !important; object-fit: cover;"/>
    									<?php    
    									    if ($banner_video_link) {
    									?>
    									    <iframe class="visible-xs visible-sm" width="100%" height="240px" src="https://www.youtube.com/embed/<?php echo $banner_video_link; ?>" frameborder="0" allowfullscreen>
                                            </iframe>
                                        <?php
                                            } else {
                                        ?>
    									
    								    	<img class="visible-xs visible-sm" src="<?php echo imager( $mobile ); ?>"/>
    									
    									<?php
                                            }
    									?>
    								
    								<?php if( $data_banners['link'] ) { ?>
    								</a>
    								<?php } ?>

							</div>

							<?php $actual++; } ?>

						</div>

						<?php if( $has_banners >= 1 && $actual >= 2 ) { ?>

							<a class="left seta seta-esquerda carousel-control" href="#carouselbanners" data-slide="prev">
								<span class="glyphicon glyphicon-chevron-left"></span>
							</a>
							<a class="right seta seta-direita carousel-control" href="#carouselbanners" data-slide="next">
								<span class="glyphicon glyphicon-chevron-right"></span>
							</a>

						<?php } ?>

					</div>

				</div>
				<?php } ?>

<div class="sceneElement">

	<div class="middle minfit">

		<div class="container nopadd visible-xs visible-sm">

			<div class="breadcrumb-gray">

				<div class="row">

					<div class="col-md-12">
			
				 		<div class="search-bar-mobile visible-xs visible-sm">

							<form class="align-middle" action="<?php echo $app['url']; ?>/<?php echo $gopath; ?>" method="GET">

								<input type="text" name="busca" placeholder="Digite sua busca..." value="<?php echo htmlclean( $_GET['busca'] ); ?>"/>
								<input type="hidden" name="categoria" value="<?php echo $categoria; ?>"/>
								<button>
									<i class="lni lni-search-alt"></i>
								</button>
								<div class="clear"></div>

							</form>

						</div>

					</div>

				</div>

			</div>

		</div>

		<div class="back-gray hidden-xs hidden-sm">

			<div class="row rowtitle">

				<div class="col-md-12">
					<div class="title-icon">
						<span>Explore <?php echo $app['title']; ?>-<?php echo $app['uf']; ?></span>
					</div>
					<div class="bread-box">
						<div class="bread">
							<a href="<?php echo $app['url']; ?>"><i class="lni lni-home"></i></a>
							<span>/</span>
							<a href="<?php just_url(); ?>/">Cidades</a>
							<span>/</span>
							<a href="<?php echo $app['url']; ?>"><?php echo $app['title']; ?>/<?php echo $app['uf']; ?></a>
						</div>
					</div>
				</div>

				<div class="col-md-12 hidden-xs hidden-sm">
					<div class="clearline"></div>
				</div>

			</div>

		</div>

		<div class="border-bottom">

			<div class="container">

				<div class="row">

					<div class="col-md-12">
						
						<div class="tv-infinite tv-infinite-menu">
							<?php
							$aba = $_GET['aba'];
							if( !$aba ) {
								$aba = "estabelecimentos";
							}
							?>
							<div class="tv-infinite tv-infinite-menu tv-tabs">
								<a <?php if( $aba == "produtos" ) { echo 'class="active"'; }; ?> href="<?php echo $app['url']; ?>?aba=produtos"><i class="lni lni-shopping-basket colored"></i> Produtos</a>
								<a <?php if( $aba == "estabelecimentos" ) { echo 'class="active"'; }; ?> href="<?php echo $app['url']; ?>?aba=estabelecimentos"><i class="lni lni-home colored"></i> Estabelecimentos</a>
							</div>
						</div>

					</div>

				</div>

			</div>

		</div>

		<div class="container">

			<?php
			if( $aba == "produtos" OR $aba == "estabelecimentos" ) {
				include( "explore-".$aba.".php" );
			} else {
				include( "explore-estabelecimentos.php" );
			}
			?>

		</div>

	</div>

</div>

<?php 
// FOOTER
$system_footer .= "";
include($virtualpath.'/_layout/rdp.php');
include($virtualpath.'/_layout/footer.php');
?>