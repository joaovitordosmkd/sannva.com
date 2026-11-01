<?php
header("Content-type: text/css");
include('../../_core/_includes/config.php');
$id = mysqli_real_escape_string( $db_con, $_GET['id'] );
$define_query = mysqli_query( $db_con, "SELECT cor FROM estabelecimentos WHERE id = '$id' LIMIT 1");
$define_data = mysqli_fetch_array( $define_query );
$cor = $define_data['cor'];
if( !$cor ) {
	$cor = "#27293E";
}
?>

div:where(.swal2-container).swal2-center>.swal2-popup {
  width: auto !important;
}

div:where(.swal2-container) .swal2-html-container {
  text-align: left !important;
}

.swal2-input {
  width: auto !important; /* Limita a largura máxima do input para 100% da largura do seu contêiner */
  word-wrap: break-word; /* Quebra palavras muito longas para a próxima linha */
}

.lni.lni-power-switch{
  font-size: 25px !important;
  font-weight: 900 !important;
}

.containerbox {
      display: flex;
      justify-content: center;
      align-items: center;
      }
      .emoji {
      font-size: 30px;
      position: relative;
      cursor: pointer;
      margin-left: 10px;
      }
      .emoji>span {
      padding: 10px;
      border: 1px solid transparent;
      transition: 100ms linear;
      }
      .emoji span:hover {
      background-color: #fff;
      border-radius: 4px;
      border: 1px solid #e7e7e7;
      box-shadow: 0 7px 14px 0 rgb(0 0 0 / 12%);
      }
      #emoji-picker {
      padding: 6px;
      font-size: 20px;
      z-index: 1;
      position: absolute;
      display: none;
      width: 189px;
      border-radius: 4px;
      top: 53px;
      right: 0;
      background: #fff;
      border: 1px solid #e7e7e7;
      box-shadow: 0 7px 14px 0 rgb(0 0 0 / 12%);
      }
      #emoji-picker span {
      cursor: pointer;
      width: 35px;
      height: 35px;
      display: inline-block;
      text-align: center;
      padding-top: 4px;
      }
      #emoji-picker span:hover {
      background-color: #e7e7e7;
      border-radius: 4px;
      }
      .emoji-arrow {
      position: absolute;
      width: 0;
      height: 0;
      top: 0;
      right: 18px;
      box-sizing: border-box;
      border-color: transparent transparent #fff #fff;
      border-style: solid;
      border-width: 4px;
      transform-origin: 0 0 0;
      transform: rotate(135deg);
      }
      /******************************/
      .creator {
      position: fixed;
      right: 5px;
      top: 5px;
      font-size: 13px;
      font-family: sans-serif;
      text-decoration: none;
      color: #111;
      }
      .creator:hover {
      color: deeppink;
      }
      .creator i {
      font-size: 12px;
      color: #111;
      }


.input-group-text {
    display: flex;
    align-items: center;
    padding: 0.4375rem 0.875rem;
    font-size: 0.9375rem;
    font-weight: 400;
    line-height: 1.53;
    color: #697a8d;
    text-align: center;
    white-space: nowrap;
    background-color: #fff;
    border: 1px solid #d9dee3;
    border-radius: 0.375rem;
}

.input-group {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    width: 100%;
}

.contorno{
  color: #fff !important;
  text-shadow: -1px 0 black, 0 1px black, 1px 0 black, 0 -1px black;
  margin-left: 10px !important;
}

.menu-link {
  color: <?php echo $cor; ?> !important;
  border: 1.5px solid <?php echo $cor; ?> !important;
	border-radius: 5px;
}

.menu-item {
  margin-left: 10px !important;
}


.btn-branco-primary {
  background-color: #ffffff;
  border-color: #ff9900;
  color: #fff;
  font-weight: bold;
  border-width: 0.25rem;
  border-radius: 0.25rem;
}

.btn-verde-whatsapp {
  background-color: #009900;
  border-color: #009900;
  color: #fff;
  font-weight: bold;
  border-radius: 0.25rem;
}

.btn-branco-verde-whatsapp {
  background-color: #ffffff;
  border-color: #009900;
  color: #009900;
  font-weight: bold;
  border-width: 0.25rem;
  border-radius: 0.25rem;
}

.btn-vermelho {
  background-color: #ff3f34;
  border-color: #ff3f34;
  color: #fff;
  font-weight: bold;
  border-radius: 0.25rem;
}

.btn-branco-vermelho {
  background-color: #fff;
  border-color: #ff3f34;
  color: #ff3f34;
  font-weight: bold;
  border-width: 0.25rem;
  border-radius: 0.25rem;
}

.btn-terceiro {
  background-color: var(--secondary-color);
  border-color: var(--secondary-color);
  color: #ffffff;
  font-weight: bold;
  border-radius: 0.25rem;
  font-size: 15px !important; 
}

.btn-terceiro-invertido {
  background-color: #ffffff;
  border-color: var(--secondary-color);
  color: var(--secondary-color);
  font-weight: bold;
  border-width: 0.25rem;
  border-radius: 0.25rem;
}

.btn-cinza {
  background-color: #717171;
  border-color: #717171;
  color: #ffffff;
  font-weight: bold;
  border-radius: 0.25rem;
  font-size: 15px !important; 
}

/* Aplica uma fonte visualmente agradável ao botão */
.btn-adicionar {
  border-radius: 8px;
  font-family: "Helvetica Neue", sans-serif;
  font-size: 15px !important;
}


.titulo-mes {
	background: <?php echo $cor; ?> !important;
	color: #fff !important;
}


.navbar.ano{
	display: flex;
    justify-content: center;
}

.dropdown.ano{
	border: 1.5px solid <?php echo $cor; ?> !important;
	border-radius: 5px;
}

.adicionar-validade{
	border: 1.5px solid <?php echo $cor; ?> !important;
	border-radius: 5px;
}

.naver {
background: transparent;
}

.naver .navbar a {
color: #052336;
}

.lista-menus .bt i,
.search-bar button i,
.user-info i, .user-menu i, .user-badge i {
color: <?php echo $cor; ?> !important;
}

.top {
border-color: <?php echo $cor; ?> !important;
border-bottom: 0;
border: 0;
}

.navigator {
border: 0;
background: <?php echo $cor; ?> !important;
}

.footer-info,
.categoria .produto .detalhes,
.carousel-indicators .active,
.botao-acao,
.sidebar .sidebar-header,
.minitop,
.opcoes .opcao.active .check,
.floatbar,
.title-icon i,
.copyright,
.panel-default > .panel-heading a {
background: <?php echo $cor; ?> !important;
}

.colored,
.lista-menus .bt i, 
.naver .navbar ul .dropdown-menu i,
.naver .navbar ul a:hover i,
.naver .navbar ul .active i,
.title-line i,
.bread i,
.sidebar .naver .navbar ul a i,
.fake-select i,
.panel-filters .panel-heading i,
.lista-menus .bt i, 
.plano .titulo-min i,
.backbutton i,
.form-field-default button i,
.add-new a i {
color: <?php echo $cor; ?> !important;
}

.naver .navbar ul a i,
.title-icon i,
.panel-filters .panel-heading i,
button i,
.voucher .form-field-default button i {
color: #fff !important;
}

.pagination > li > a:hover, .pagination > .active > a, .pagination > .active > a:focus, .pagination > .active > a:hover, .pagination > .active > span, .pagination > .active > span:focus, .pagination > .active > span:hover {
background: <?php echo $cor; ?> !important;
color: #fff;
}

.wizard > .steps .current a,
.wizard > .steps .current a:hover,
.wizard > .steps .current a.active,
.wizard .actions a,
button,
.add-new a:hover {
background: <?php echo $cor; ?> !important;
}

.add-new a:hover i {
color: #fff !important;
}

.search-bar button,
button.close {
background: transparent !important;
}

.panel-default > .panel-heading + .panel-collapse > .panel-body {
border-top: 0;
}

.naver .navbar a {
color: #fff;
}

.bg-gray {
background: transparent;
}

.lista-menus .bt i.lni-shuffle,
.sidebar a {
color: #333 !important;
}

.form-field-default button {
background: rgba(0,0,0,.05) !important;
}

.panel-pendentes .panel-title a {
background: #e67e22 !important
}

.variacoes .variacao .title { 
border-top: 1px solid rgba(255,255,255,.15);
background: rgba(0,0,0,.1) !important;
filter: brightness(120%) grayscale(20%);
}

.variacoes .variacao .title label,
.variacoes .variacao .title input {
color: #333;
}

.variacoes .variacao .remover i {
background: transparent;
}

.pagination a:hover i,
.botao-whatsapp,.botao-whatsapp:hover, .botao-whatsapp:active, .botao-whatsapp:focus,
.botao-whatsapp i {
color: #fff !important;
}

#collapse-voucher .form-field-default button {
border: 0;
background: <?php echo $cor; ?> !important;
}

/* ALL MOBILE */

@media (max-width: 991px) {

	.sidebar .search-bar {
	margin-bottom: 5px;
	width: 100%;
	}

	.user-info i, 
	.user-menu i,
	.sidebar .sidebar-header .close-sidebar {
	color: #fff !important;
	}

	.shop-bag i {
	color: #fff !important;
	}

	.top {
	border-top: 0;
	background: <?php echo $cor; ?> !important;
	}

	.naver {
	background: transparent !important;
	}

}

}

/* ALL DESK */

@media (min-width: 991px) {

}