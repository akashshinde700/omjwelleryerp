<?php
/*
 * **************************************************************************************
 * @Description: Discount Table File @AUTHOR-PRIYANKA-17OCT2020
 * **************************************************************************************
 *
 * Created on OCT 17, 2017 05:36:00 PM
 *
 * @FileName: omtbdiscount.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: 2.7.21
 * @version 2.7.21
 * @Copyright (c) 2020 www.softwaregen.com
 * @All rights reserved
 * Copyright 2020 SoftwareGen, Inc
 *
 * @ModificaionHistory
 * MODIFICATION DATE:
 * AUTHOR: @AUTHOR-PRIYANKA-17OCT2020
 * REASON:
 *
 * Project Name: Online Munim ERP Accounting Software 2.7.21
 * Version: 2.7.21
 * Website: http://www.omunim.com/
 * Contact: info@omunim.com
 * Follow: www.twitter.com/omunim
 * Like: www.facebook.com/omunim
 * Purchase: http://www.omunim.com/buy.html
 * License: You must have a valid license purchased only from Online Munim
 */
?>
<?php
//
// Create new table discount @AUTHOR-PRIYANKA-17OCT2020
$query = "CREATE TABLE IF NOT EXISTS discount (
disc_id                                                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT," .
// For Stock Main Entry Reference Id @AUTHOR-PRIYANKA-17OCT2020
"disc_st_id                                                     VARCHAR(16),
disc_owner_id                                                   VARCHAR(16),
disc_firm_id                                                    VARCHAR(16),
disc_st_metal_type                                              VARCHAR(30),
disc_st_item_category                                           VARCHAR(50),
disc_st_purity                                                  VARCHAR(15),
disc_product_amount                                             VARCHAR(30),
disc_making_discount                                            VARCHAR(10),
disc_stone_discount                                             VARCHAR(10),
disc_product_discount                                           VARCHAR(10),
disc_online_product                                           VARCHAR(10),
disc_online_product_price_bounce                                           VARCHAR(10),
disc_total_bill_amount_min                                      VARCHAR(30),
disc_total_bill_amount_max                                      VARCHAR(30),
disc_total_bill_amount_discount                                 VARCHAR(10),".
// Added New Columns For Retail Discount Management Functionality @Author:SHRIKANT-17-JAN-2023          
"st_product_commission_amount                                   VARCHAR(16),
disc_start_date                                                 VARCHAR(32),
disc_end_date                                                   VARCHAR(32),
disc_product_check                                              VARCHAR(20),
disc_discount_check                                             VARCHAR(20),
disc_discount_adjust                                            VARCHAR(20),
disc_active                                                     VARCHAR(10),
disc_status                                                     VARCHAR(10),
disc_panel_name                                                 VARCHAR(22),".       
"last_column                                                    VARCHAR(1))AUTO_INCREMENT=1";
//
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>