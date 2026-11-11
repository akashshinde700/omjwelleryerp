<?php
/*
 * Created on 28-April-2025 17:00:00 PM
 *
 * @FileName: omtbusercart.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: eMunim
 * @version 1.0
 * @Copyright (c) 2015 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2015 SoftwareGen, Inc
 *
 * @ModificationHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php

$query = "CREATE TABLE IF NOT EXISTS user_cart (
    ucart_id               INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    ucart_user_id          INT,
    ucart_sttr_id          INT,
    ucart_color            VARCHAR(16),
    ucart_quantity         VARCHAR(16), 
    ucart_size             INT,
    ucart_created_date     DATETIME,
    ucart_upd_date         DATETIME,
    ucart_last_visited     DATETIME,
    last_column            VARCHAR(1)
    )";

if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
// To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>