<?php

/*
 * Created on 01-Aug-2011 10:56:17 PM
 *
 * @FileName: omtbgvan.php
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

$query = "CREATE TABLE IF NOT EXISTS girvi_analysis (
girvana_id                      INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
girvana_owner_id		VARCHAR(16),
girvana_firm_type		VARCHAR(16), 
girvana_total_girvi             VARCHAR(32),
girvana_personal_girvi          VARCHAR(32),
girvana_sahukar_girvi           VARCHAR(32),
girvana_today_rel_girvi         VARCHAR(32),
girvana_today_new_girvi         VARCHAR(32),
girvana_curr_week_rel_girvi     VARCHAR(32),
girvana_curr_week_new_girvi     VARCHAR(32),
girvana_entry_date              DATETIME,
girvana_other_info		VARCHAR(100),
last_column                VARCHAR(1))AUTO_INCREMENT=1";

if (!mysqli_query($conn,$query)) {
    die('Error: ' . mysqli_error($conn));
}
//To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
//echo "Girvi Analysis Table Created Successfully.\n";

?>