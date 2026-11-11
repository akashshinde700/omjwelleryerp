<?php

/*
 * Created on 11 JAN 2023 10:23PM
 *
 * @FileName: omtbvisreq.php
 * @Author: RENUKA SHARMA
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: oMunim
 * @version 2.7
 * @Copyright (c) www.omunim.com
 * @All rights reserved
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php
//
$query = "CREATE TABLE IF NOT EXISTS visitor_requirement (
vr_id                          INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
vr_own_id                      VARCHAR(16),
vr_visitor_id                  VARCHAR(16),
vr_location                    VARCHAR(30),
vr_city                        VARCHAR(50), 
vr_moving_from                 VARCHAR(200),
vr_moving_to                   VARCHAR(200),
vr_inspection                  VARCHAR(15),
vr_since                       DATETIME,
vr_moving_from_floor_no        VARCHAR(20),
vr_moving_from_lift            VARCHAR(10),
vr_moving_to_floor_no          VARCHAR(20),
vr_moving_to_lift              VARCHAR(10),
vr_property_details            VARCHAR(20),
vr_tv                          VARCHAR(30),
vr_tv_stand                    VARCHAR(30),
vr_ac                          VARCHAR(30),
vr_wardrobe                    VARCHAR(30),
vr_almirah                     VARCHAR(30),
vr_table                       VARCHAR(30),
vr_kitchen                     VARCHAR(30),
vr_chair                       VARCHAR(30),
vr_washing_machine             VARCHAR(30),
vr_fridge                      VARCHAR(30),
vr_bed                         VARCHAR(30),
vr_single_cot                  VARCHAR(30),
vr_fan                         VARCHAR(30),
vr_sofa                        VARCHAR(30),
vr_dinning_table               VARCHAR(30),
vr_cooler                      VARCHAR(30),
vr_carton_box                  VARCHAR(30),
vr_extra                       VARCHAR(30),
last_column                    VARCHAR(1))";
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
include 'ommptbauprdwrfl.php';
?>