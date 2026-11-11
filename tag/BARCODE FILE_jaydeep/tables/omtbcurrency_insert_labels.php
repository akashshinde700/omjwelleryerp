<?php

// file name: omtbcurrency_insert_labels.php
$query = "INSERT INTO currency (currency_own_id, currency_value, currency_type, currency_name)
          SELECT * FROM (SELECT '$ownerId', '1', 'coin', 'one_rupee_coin') AS tmp
          WHERE NOT EXISTS (SELECT currency_name FROM currency 
          WHERE currency_name = 'one_rupee_coin' AND currency_type = 'coin') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO currency (currency_own_id, currency_value, currency_type, currency_name)
          SELECT * FROM (SELECT '$ownerId', '2', 'coin', 'two_rupee_coin') AS tmp
          WHERE NOT EXISTS (SELECT currency_name FROM currency 
          WHERE currency_name = 'two_rupee_coin' AND currency_type = 'coin') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO currency (currency_own_id, currency_value, currency_type, currency_name)
          SELECT * FROM (SELECT '$ownerId', '5', 'coin', 'five_rupee_coin') AS tmp
          WHERE NOT EXISTS (SELECT currency_name FROM currency 
          WHERE currency_name = 'five_rupee_coin' AND currency_type = 'coin') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO currency (currency_own_id, currency_value, currency_type, currency_name)
          SELECT * FROM (SELECT '$ownerId', '10', 'coin', 'ten_rupee_coin') AS tmp
          WHERE NOT EXISTS (SELECT currency_name FROM currency 
          WHERE currency_name = 'ten_rupee_coin' AND currency_type = 'coin') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO currency (currency_own_id, currency_value, currency_type, currency_name)
          SELECT * FROM (SELECT '$ownerId', '20', 'coin', 'twenty_rupee_coin') AS tmp
          WHERE NOT EXISTS (SELECT currency_name FROM currency 
          WHERE currency_name = 'twenty_rupee_coin' AND currency_type = 'coin') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO currency (currency_own_id, currency_value, currency_type, currency_name)
          SELECT * FROM (SELECT '$ownerId', '10', 'note', 'ten_rupee_notes') AS tmp
          WHERE NOT EXISTS (SELECT currency_name FROM currency 
          WHERE currency_name = 'ten_rupee_notes' AND currency_type = 'note') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO currency (currency_own_id, currency_value, currency_type, currency_name)
          SELECT * FROM (SELECT '$ownerId', '20', 'note', 'twenty_rupee_notes') AS tmp
          WHERE NOT EXISTS (SELECT currency_name FROM currency 
          WHERE currency_name = 'twenty_rupee_notes' AND currency_type = 'note') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO currency (currency_own_id, currency_value, currency_type, currency_name)
          SELECT * FROM (SELECT '$ownerId', '50', 'note', 'fifty_rupee_notes') AS tmp
          WHERE NOT EXISTS (SELECT currency_name FROM currency 
          WHERE currency_name = 'fifty_rupee_notes' AND currency_type = 'note') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO currency (currency_own_id, currency_value, currency_type, currency_name)
          SELECT * FROM (SELECT '$ownerId', '100', 'note', 'hundred_rupee_notes') AS tmp
          WHERE NOT EXISTS (SELECT currency_name FROM currency 
          WHERE currency_name = 'hundred_rupee_notes' AND currency_type = 'note') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO currency (currency_own_id, currency_value, currency_type, currency_name)
          SELECT * FROM (SELECT '$ownerId', '200', 'note', 'twohundred_rupee_notes') AS tmp
          WHERE NOT EXISTS (SELECT currency_name FROM currency 
          WHERE currency_name = 'twohundred_rupee_notes' AND currency_type = 'note') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
$query = "INSERT INTO currency (currency_own_id, currency_value, currency_type, currency_name)
          SELECT * FROM (SELECT '$ownerId', '500', 'note', 'fivehundred_rupee_notes') AS tmp
          WHERE NOT EXISTS (SELECT currency_name FROM currency 
          WHERE currency_name = 'fivehundred_rupee_notes' AND currency_type = 'note') LIMIT 1";
//
if (!mysqli_query($conn, $query))
    die('Query:' . $query . '<br/>Error: ' . mysqli_error($conn));
//
//
?>