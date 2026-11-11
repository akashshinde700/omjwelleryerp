<?php

/*
 * **************************************************************************************
 * @tutorial: 
 * **************************************************************************************
 * 
 * Created on 23 Jul, 2018 4:27:09 PM
 *
 * @FileName: ogtbxrf.php
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

$query = "CREATE TABLE IF NOT EXISTS xrf_entries (
xrf_id                         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
xrf_owner_id                   VARCHAR(16),
xrf_firm_id                    VARCHAR(16),
xrf_user_id                    VARCHAR(16),
xrf_user_name                  VARCHAR(50),
xrf_user_mobile                VARCHAR(16),
xrf_transaction_type           VARCHAR(16),
xrf_pre_invoice_no             VARCHAR(10),
xrf_invoice_no                 VARCHAR(50),
xrf_pre_bill_no                VARCHAR(10),
xrf_bill_no                    VARCHAR(50),
xrf_account_id                 VARCHAR(16),
xrf_jrnl_id                    INT,
xrf_add_date                   VARCHAR(32),
xrf_add_date_time              VARCHAR(50),
xrf_metal_type                 VARCHAR(36),
xrf_prod_name                  VARCHAR(100),
xrf_prod_category              VARCHAR(80),
xrf_prod_desc                  VARCHAR(100),
xrf_prod_other_info            VARCHAR(100),
xrf_prod_quantity              VARCHAR(10),
xrf_prod_gs_weight             VARCHAR(15),
xrf_prod_gs_weight_type        VARCHAR(10),
xrf_karat                      VARCHAR(10),
xrf_Gold                       VARCHAR(10),
xrf_Silver                     VARCHAR(10),
xrf_Cobalt                     VARCHAR(10),
xrf_Copper                     VARCHAR(10),
xrf_Zinc                       VARCHAR(10),
xrf_Cadmium                    VARCHAR(10),
xrf_Nickel                     VARCHAR(10),
xrf_Palladium                  VARCHAR(10),
xrf_Indium                     VARCHAR(10),
xrf_Tin                        VARCHAR(10),
xrf_Iridium                    VARCHAR(10),
xrf_Ruthenium                  VARCHAR(10),
xrf_Iron                       VARCHAR(10),
xrf_Manganese                  VARCHAR(10),
xrf_Gallium                    VARCHAR(10),
xrf_Rhodium                    VARCHAR(10),
xrf_Rhenium                    VARCHAR(10),
xrf_Lead                       VARCHAR(10),
xrf_Bismuth                    VARCHAR(10),
xrf_Osmium                     VARCHAR(10),
xrf_Tungsten                   VARCHAR(10),
xrf_Platinum                   VARCHAR(10),
xrf_Moly                       VARCHAR(10),
xrf_Chromium                   VARCHAR(10),
xrf_Titanium                   VARCHAR(10),
xrf_Vanadium                   VARCHAR(10),
xrf_Germanium                   VARCHAR(10),
xrf_Arsenic                   VARCHAR(10),
xrf_Selenium                   VARCHAR(10),
xrf_Zirconium                   VARCHAR(10),
xrf_Niobium                   VARCHAR(10),
xrf_Molybdenum                   VARCHAR(10),
xrf_Antimony                   VARCHAR(10),
xrf_Tellurium                   VARCHAR(10),
xrf_Hafnium                   VARCHAR(10),
xrf_Tantalum                   VARCHAR(10),
xrf_MQ                         VARCHAR(10),
xrf_Others                     VARCHAR(10),
xrf_since                      DATETIME,
xrf_status                     VARCHAR(32),
xrf_barcode_name               VARCHAR(16),
xrf_image_id                   VARCHAR(16),
xrf_last_column                VARCHAR(5))AUTO_INCREMENT=1";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//xrf_tot_tax added in item_stock table @Author : SHE21OCT15
?>