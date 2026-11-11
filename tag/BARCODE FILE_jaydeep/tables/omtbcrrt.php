<!-- 
Template Name: Online Munim Accounting Software
Version: 1.0
Author: SoftwareGen Technologies
Website: http://www.omunim.com/
Contact: info@omunim.com
Phone: +91 8550958585, +91 8551958585
Company Website: http://www.softwaregen.com/
Follow: www.twitter.com/omunim
Like: www.facebook.com/omunim
License: You must have a valid license to use the software.
-->
<?php
/*
 * **************************************************************************************
 * @Description:
 * **************************************************************************************
 *
 * Created on 10 Mar, 2015 2:43:35 PM
 *
 * @FileName: omtbcrrt.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: 2
 * @version 1.0.1
 * @Copyright (c) 2015 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2015 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
/**** START code to create crystal rate table @Author:SHE10MAR15*******/
$query = "CREATE TABLE IF NOT EXISTS crystal_rates(
cry_rate_id                          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
cry_rate_own_id                      VARCHAR(50),
cry_rate_crystal_id                  VARCHAR(50),
cry_rate_value                       VARCHAR(50),
cry_rate_sell_value                  VARCHAR(50),
cry_rate_per_wt                      VARCHAR(2000),
cry_rate_purch_wt_tp                   VARCHAR(20),
cry_rate_per_wt_tp                   VARCHAR(50),
cry_rate_ent_date                    DATETIME,
cry_rate_upd_sts                     VARCHAR(50),
cry_rate_comm                        VARCHAR(500),
cry_rate_staff_id                    VARCHAR(50),". 
/* START CODE TO ADD COLUMN TO ADD CLARITY RATE, CLARITY COLOR, COLOR, COLOR RATE, CUT, SHAPE AND CERTIFICATE LAB,@AUTHOR:HEMA-4AUG2020 */
"cry_rate_clarity_color               VARCHAR(50),
cry_rate_clarity_rate                VARCHAR(50),
cry_rate_color                       VARCHAR(50),
cry_rate_color_rate                  VARCHAR(50),
cry_rate_cut                         VARCHAR(50),
cry_rate_category                    VARCHAR(100),
cry_rate_name                        VARCHAR(100),
cry_rate_shape                       VARCHAR(50),
cry_rate_certificate_lab             VARCHAR(50),".
"cry_rate_crystal_clarity_color      VARCHAR(50),".
"last_column                          VARCHAR(1)
)AUTO_INCREMENT=1";
/* END CODE TO ADD COLUMN TO ADD CLARITY RATE, CLARITY COLOR, COLOR AND COLOR RATE, CUT, SHAPE AND CERTIFICATE LAB,@AUTHOR:HEMA-4AUG2020 */
if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//
/**** END code to create crystal rate table @Author:SHE10MAR15********/
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>