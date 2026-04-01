# --- 1. MEMBERIKAN SENJATA MODIFIKASI ---
# Menggunakan identifier asli agar menimpa item vanilla
give @s minecraft:netherite_spear 1
give @s minecraft:mace 1
give @s minecraft:trident 1
give @s minecraft:shield 1
give @s minecraft:totem_of_undying 64

# --- 2. MEMBERIKAN ARMOR SET ---
give @s minecraft:netherite_helmet 1
give @s minecraft:netherite_chestplate 1
give @s minecraft:netherite_leggings 1
give @s minecraft:netherite_boots 1

# --- 3. KONSUMSI & LOGISTIK ---
give @s minecraft:enchanted_golden_apple 4
give @s minecraft:ender_pearl 16
give @s minecraft:ender_pearl 16
give @s minecraft:golden_carrot 64

# --- 4. PENYIAPAN ENCHANTMENT ---
# Memberikan pesan instruksi ke layar
title @s actionbar §ePakai Armor & Pegang Shield di Offhand!

# Memberikan Tag untuk memicu fungsi enchantItem() di main.js
tag @s add chaos_enchant_trigger

# --- 5. FEEDBACK ---
say §l§b[ChaosPVP]§r §7Loadout tempur telah siap. Gunakan dengan bijak!
