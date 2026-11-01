<?php

// CORE
include('../../../_core/_includes/config.php');

global $simple_url;
?>
<nav class="navbar pull-left">
	<ul class="nav navbar-nav">
		<li class="active"><a href="<?php just_url(); ?>">Ínicio</a></li>
		 
	</ul>
</nav> 

<nav class="navbar pull-right hidden-xs hidden-sm">
	<ul class="nav navbar-nav">
		<li class="active"><a target="_blank" href="https://api.whatsapp.com/send?phone=<?php echo $whatsapp; ?>&text=Olá preciso de ajuda!"><i class="lni lni-headphone-alt icon-left"></i> Fale conosco</a></li>
	</ul>
</nav> 

<div class="clear"></div>