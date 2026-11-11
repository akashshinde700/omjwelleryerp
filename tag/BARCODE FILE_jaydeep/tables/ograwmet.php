<?php

/*
 * Created on 01-Feb-2011 10:56:17 PM
 *
 * @FileName: ograwmet.php
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
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php

$query = "CREATE TABLE IF NOT EXISTS raw_metals(
        raw_metal_id         INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
        raw_metal_own_id     VARCHAR(20),
        raw_metal_name       VARCHAR(30),
        raw_metal_cat        VARCHAR(40),
        raw_metal_type       VARCHAR(30),
        raw_metal_entry_date VARCHAR(60),
        raw_metal_added_by   VARCHAR(20),
        raw_metal_snap 	     LONGBLOB,
        raw_metal_snap_thumb LONGBLOB,
        raw_metal_snap_fname VARCHAR(150),
        raw_metal_snap_ftype VARCHAR(20),
        raw_metal_snap_fsize VARCHAR(40),
        raw_metal_snap_fszMB VARCHAR(40),
        last_column   VARCHAR(1),UNIQUE KEY (raw_metal_name))AUTO_INCREMENT=1";//ADD UNIQUE KEY added in ommptbupd @AUTHOR: SANDY16DEC13

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
?>
