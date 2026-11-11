<?php

/*
 * **************************************************************************************
 * @tutorial:First Month Indicator
 * **************************************************************************************
 * 
 * Created on Jun 29, 2013 5:45:28 PM
 *
 * @FileName: omtbindi.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version 1.0.1
 * @Copyright (c) 2013 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2013 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php

/* * ********Start code to change file @Author:SHRI25JUN15*************** */
/* * **********Start code to add omin_eng_date,omin_hindi_tithi,omin_hindi_paksh,omin_hindi_mn,omin_hindi_yr @Author:ANUJA17JUN15 *************** */
$query = "CREATE TABLE IF NOT EXISTS omindicators (
omin_id                 INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
omin_own_id             VARCHAR(16),
omin_option             VARCHAR(100),
omin_input_field        VARCHAR(20),
omin_input_field_label  VARCHAR(100),
omin_field_horizontal   VARCHAR(100),
omin_field_mandatory    VARCHAR(10),
omin_default            VARCHAR(16),
omin_value              VARCHAR(100),
omin_contents           VARCHAR(5000)," .
// New Columns Added for Google Suggestion Functionality @PRIYANKA-06MAY18
        "omin_gs_table_name      VARCHAR(50),
omin_gs_column_name     VARCHAR(50),
omin_gs_column_display  VARCHAR(50),
omin_gs_where_cond      VARCHAR(200),
omin_keyup_fun          VARCHAR(50),
omin_keydown_fun        VARCHAR(50),
omin_onblur_fun         VARCHAR(50),
omin_onfocus_fun        VARCHAR(50),
omin_onchange_fun       VARCHAR(50),
omin_doubleclick_fun    VARCHAR(50),
omin_transaction_type   VARCHAR(50),
omin_indicator          VARCHAR(50),
ADKM_MM                 VARCHAR(20),
ADKM_YY                 VARCHAR(20), 
omin_eng_date           VARCHAR(16),
omin_hindi_tithi        VARCHAR(16),
omin_hindi_paksh        VARCHAR(16),
omin_hindi_mn           VARCHAR(16),
omin_hindi_yr           VARCHAR(16),
omx_pos                 VARCHAR(16),
omy_pos                 VARCHAR(16),
omx_mpos                VARCHAR(16),
omy_mpos                VARCHAR(16),
omin_panel              VARCHAR(50),
omin_template           VARCHAR(50),
omin_caption            VARCHAR(50),
omin_caption_value      VARCHAR(100),
omin_fontsize           VARCHAR(20),
omin_fontwt             VARCHAR(10),
omin_fontstyle          VARCHAR(10),
omin_rotation           VARCHAR(20),
omin_boldness           VARCHAR(20),
omin_row_no             VARCHAR(20),"// COLUMN ADDED FOR STORED ROW NO FOR FORM CUSTOMIZATION @MADHUREE-24MARCH2020
."omin_hindi_opt          VARCHAR(10),"
. "last_column                VARCHAR(1))AUTO_INCREMENT=1";



if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
/* * **********End code to add omin_eng_date,omin_hindi_tithi,omin_hindi_paksh,omin_hindi_mn,omin_hindi_yr @Author:ANUJA17JUN15 *************** */
/* * ********End code to change file @Author:SHRI25JUN15*************** */
?>
