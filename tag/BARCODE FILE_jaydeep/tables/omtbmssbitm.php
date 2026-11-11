<?php
/*
 * **********************************************************************************************************************
 * @tutorial: START CODE FOR MASTER SUB ITEM TABLE @HEMA-8APR19
 * *********************************************************************************************************************
 * 
 * Created on APR 19, 2018 17:29:00 PM
 *
 * @FileName: omtbmssbitm.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: eMunim
 * @version 1.0
 * @Copyright (c) 2010 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2010 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR: @HEMA-8APR19
 *  REASON:
 *
 */
?>
<?php
// START CODE TO CREATE MASTER SUB ITEM TABLE @HEMA-8APR19
$query = "CREATE TABLE IF NOT EXISTS master_subitem (
ms_sub_itm_id                   INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
ms_sub_itm_ms_item_id           VARCHAR(16),
ms_sub_itm_user_id              VARCHAR(16),
ms_sub_itm_user_group           VARCHAR(30),
ms_sub_itm_from_wt              VARCHAR(16),
ms_sub_itm_to_wt                VARCHAR(16),
ms_sub_itm_wstg_min             VARCHAR(16),
ms_sub_itm_wstg_max             VARCHAR(16),
ms_sub_itm_price                VARCHAR(16),
ms_sub_itm_price_type           VARCHAR(16),
ms_sub_itm_mkg_min              VARCHAR(16),
ms_sub_itm_mkg_max              VARCHAR(16),
ms_sub_itm_mkg_min_gm           VARCHAR(16),
ms_sub_itm_mkg_max_gm           VARCHAR(16),
ms_sub_itm_mkg_min_pp           VARCHAR(16),
ms_sub_itm_mkg_max_pp           VARCHAR(16),
ms_sub_itm_mkg_min_fx           VARCHAR(16),
ms_sub_itm_mkg_max_fx           VARCHAR(16),
ms_sub_itm_disc_code            VARCHAR(25),
ms_sub_itm_disc_min             VARCHAR(16),
ms_sub_itm_disc_max             VARCHAR(16),
ms_sub_itm_disc_min_gm          VARCHAR(16),
ms_sub_itm_disc_max_gm          VARCHAR(10),
ms_sub_itm_disc_min_pp          VARCHAR(16),
ms_sub_itm_disc_max_pp          VARCHAR(16),
ms_sub_itm_disc_min_fx          VARCHAR(16),
ms_sub_itm_disc_max_fx          VARCHAR(16),
ms_sub_itm_disc_mkg_min_fx      VARCHAR(16),
ms_sub_itm_disc_mkg_max_fx      VARCHAR(16),
ms_sub_itm_wholesale_pur_price    VARCHAR(25),
ms_sub_itm_wholesale_sell_price   VARCHAR(25),
last_column                     VARCHAR(1))AUTO_INCREMENT = 1";
//
if (!mysqli_query($conn,$query)) {
die('Error master_subitem: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
// END CODE TO CREATE MASTER SUB ITEM TABLE @HEMA-8APR19
?>
