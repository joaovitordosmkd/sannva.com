<?php
global $httprotocol;
global $simple_url;
$full_simple_url = $httprotocol.$simple_url;
?>

<div class="header">

	<div class="top">

		<div class="container">

			<div class="row align-middle hidden-sm hidden-xs">

				<div class="col-md-3">

					<div class="brand brand-image pull-left">
						<a href="<?php just_url(); ?>">
							<img src="<?php just_url(); ?>/_core/_cdn/img/logo.png"/>
						</a>
					</div>

				</div>

				<div class="col-md-6">

					<div class="search-bar">

						<div class="clear"></div>

						 

					</div>

				</div>

				<div class="col-md-3">

					<div class="user-info pull-right">

						<div class="user-info-login">
							<a href="<?php just_url(); ?>/login" title="Faça login ou cadastre-se">
								<i class="lni lni-user"></i>
								<span>Faça login ou cadastre-se</span>
							</a>
						</div>

					</div>

				</div>

			</div>

			<div class="row align-middle-mobile visible-sm visible-xs">

				<div class="col-md-3 col-sm-3 col-xs-3">

					<div class="user-menu pull-left">
						<a href="#" class="sidrLeft" href="#sidebarLeft" title="Menu">
							<i class="lni lni-menu"></i>
						</a>
					</div>

				</div>

				

				<div class="col-md-3 col-sm-3 col-xs-3">

					<div class="user-info pull-right">

						<div class="user-info-login">
							<a href="#" class="sidrRight" href="#sidebarRight" title="Minha conta">
								<i class="lni lni-user"></i>
							</a>
						</div>

					</div>

				</div>

			</div>


		</div>

	</div>

	<div class="navigator naver hidden-sm hidden-xs">

		<div class="container">

			<div class="row">

				<div class="col-md-12">

					<?php include('navigation.php'); ?>

				</div>

			</div>

		</div>

	</div>

</div>