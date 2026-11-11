<?php

/*
 * **************************************************************************************
 * @tutorial: Blog Table @Author:ASHWINI-20DECEMBER2023
 * **************************************************************************************
 * 
 * Created on DECEMBER 20, 2023 14:00:00 PM
 *
 * @FileName: omtbblog.php
 * @Author: SoftwareGen Developement Team
 * @AuthorEmailId:  info@softwaregen.com
 * @ProjectName: omunim
 * @version:
 * @Copyright (c) 2023 www.softwaregen.com
 * @All rights reserved
 *  Copyright 2023 SoftwareGen, Inc
 *
 * @ModificaionHistory
 *  MODIFICATION DATE:
 *  AUTHOR:
 *  REASON:
 *
 */
?>
<?php

$query = "CREATE TABLE IF NOT EXISTS blog (
blog_id                               INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
blog_own_id                           VARCHAR(16),
blog_website                          VARCHAR(64),
blog_theme                            VARCHAR(32),
blog_type                             VARCHAR(32),
blog_category                         VARCHAR(32),
blog_title                            VARCHAR(32),
blog_content                          LONGBLOB,
blog_content_image_pos                VARCHAR(12),
blog_content_image_id                 VARCHAR(12),
blog_content_image_alt                VARCHAR(24),
blog_content_1                        LONGBLOB,
blog_content_1_image_pos              VARCHAR(12),
blog_content_1_image_id               VARCHAR(12),
blog_content_1_image_alt              VARCHAR(24),
blog_content_2                        LONGBLOB,
blog_content_2_image_pos              VARCHAR(12),
blog_content_2_image_id               VARCHAR(12),
blog_content_2_image_alt              VARCHAR(24),
blog_content_3                        LONGBLOB,
blog_content_3_image_pos              VARCHAR(12),
blog_content_3_image_id               VARCHAR(12),
blog_content_3_image_alt              VARCHAR(24),
blog_content_4                        LONGBLOB,
blog_content_4_image_pos              VARCHAR(12),
blog_content_4_image_id               VARCHAR(12),
blog_content_4_image_alt              VARCHAR(24),
blog_keywords                         VARCHAR(200),
blog_since                            DATETIME,
last_column                           VARCHAR(1))AUTO_INCREMENT=1";
//
if (!mysqli_query($conn, $query)) {
    die('Error: ' . mysqli_error($conn));
}
//
// To check new columns added into table or not 
include 'ommptbauprdwrfl.php';
?>