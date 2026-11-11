<?php

/*
 * Created on 21-Nov-2019 12:40:17 AM
 *
 * @FileName: omtbwilist.php
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
$query = "CREATE TABLE IF NOT EXISTS wishlist(
        wishlist_id            INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
        wishlist_owner_id      VARCHAR(20),
        wishlist_user_id       INT,
        wishlist_prod_id       INT,
        wishlist_name          VARCHAR(50),
        last_column                VARCHAR(1))";
        
if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
?>
