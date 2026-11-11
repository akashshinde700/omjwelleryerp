<?php

/*
 * **************************************************************************************
 * @tutorial: 
 * **************************************************************************************
 * 
 * Created on 20 Jan, 2019 12:45:12 PM
 *
 * @FileName: ogtbrfidtally.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 2.6.0
 * @Copyright (c) 2018 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2018 SoftwareGen Technologies
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php

$query = "CREATE TABLE IF NOT EXISTS rfid_tally (
rfidtly_id                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
rfidtly_owner_id                   VARCHAR(16),
rfidtly_sttr_id                    VARCHAR(16),
rfidtly_firm_id                    VARCHAR(16),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_rfid_id                   VARCHAR(64),
rfidtly_scan_date                  VARCHAR(24),
rfidtly_scan_time                  VARCHAR(24),
rfidtly_scan_status                VARCHAR(4),
rfidtly_since                      DATETIME,".
"rfidtly_product_code              VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022 
//        
"rfidtly_st_id                     VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_add_date                  VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_quantity                  VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_gs_weight_type            VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_gs_weight                 VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_nt_weight_type            VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_nt_weight                 VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_fine_weight               VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_stock_type                VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_purity                    VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_transaction_type          VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_sell_status               VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_status                    VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
//
"rfidtly_indicator                 VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_metal_type                 VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_product_name              VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT NAME FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_product_category          VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT CATEGORY FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_counter_name              VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT CATEGORY FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_location                  VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT CATEGORY FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_open_report               VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT CATEGORY FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_close_report              VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT CATEGORY FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_reporting_preiod          VARCHAR(50),". // COLUMN ADDED TO STOCK TALLY PRODUCT CATEGORY FOR @AUTHOR:YUVRAJ-15OCTOMBER2022  
"rfidtly_last_column	           VARCHAR(1))AUTO_INCREMENT=1";
// 
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>