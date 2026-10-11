CREATE DATABASE IF NOT EXISTS housing_sales;
USE housing_sales;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(40) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS units (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(60) NOT NULL,
    location VARCHAR(120) NOT NULL,
    status ENUM('Available', 'Sold') NOT NULL DEFAULT 'Available',
    price DECIMAL(12,2) NOT NULL,
    image_data LONGTEXT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS buyers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    agent VARCHAR(120) NOT NULL DEFAULT 'Unassigned',
    viewing_date DATE NULL,
    viewing_time TIME NULL,
    unit VARCHAR(100) NULL,
    status ENUM('Pending', 'Sold', 'Cancelled') NOT NULL DEFAULT 'Pending'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    text VARCHAR(500) NOT NULL
) ENGINE=InnoDB;

ALTER TABLE users MODIFY password VARCHAR(255) NOT NULL;

CREATE TABLE IF NOT EXISTS buyer_followups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    buyer_id INT NOT NULL,
    note VARCHAR(500) NOT NULL,
    due_date DATE NOT NULL,
    status ENUM('Open', 'Done') NOT NULL DEFAULT 'Open',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_followups_buyer FOREIGN KEY (buyer_id)
        REFERENCES buyers(id) ON DELETE CASCADE,
    INDEX idx_followups_due_date (due_date)
) ENGINE=InnoDB;
