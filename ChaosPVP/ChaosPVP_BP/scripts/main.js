import { 
    world, 
    system, 
    EquipmentSlot, 
    ItemComponentTypes, 
    EntityDamageCause,
    DynamicPropertiesDefinition 
} from "@minecraft/server";

const chargingPlayers = new Set();
const activeDragons = new Map(); 

// ==========================================
// 1. REGISTRASI CUSTOM COMPONENTS
// ==========================================
system.beforeEvents.startup.subscribe((initEvent) => {
    initEvent.itemComponentRegistry.registerCustomComponent("chaos:spear_controller", {});
    initEvent.itemComponentRegistry.registerCustomComponent("chaos:shield_controller", {});
    initEvent.itemComponentRegistry.registerCustomComponent("chaos:mace_controller", {});

    initEvent.itemComponentRegistry.registerCustomComponent("chaos:trident_riptide", {
        onStoppedUsing(event) {
            const { itemStack, source: player, useDuration } = event;
            
            const enchantable = itemStack.getComponent(ItemComponentTypes.Enchantable);
            let riptideLevel = 0;
            if (enchantable) {
                const riptide = enchantable.getEnchantment("riptide");
                if (riptide) riptideLevel = riptide.level;
            }

            if (riptideLevel > 0 && useDuration > 10) {
                const viewDir = player.getViewDirection();
                const power = 1.5 + (riptideLevel * 0.5);

                player.applyImpulse({
                    x: viewDir.x * power,
                    y: viewDir.y * power + 0.5,
                    z: viewDir.z * power
                });

                player.dimension.playSound("item.trident.riptide_3", player.location);
                player.dimension.spawnParticle("minecraft:riptide_particle", player.location);
                player.playAnimation("animation.trident.riptide", { blendOutTime: 0.5 });

                let duration = 20; 
                let hitLoop = system.runInterval(() => {
                    if (duration <= 0 || !player.isValid()) {
                        system.clearRun(hitLoop);
                        return;
                    }

                    const targets = player.dimension.getEntities({
                        location: player.location,
                        maxDistance: 2,
                        excludeIds: [player.id]
                    });

                    for (const target of targets) {
                        target.applyDamage(4 + riptideLevel * 2, {
                            cause: EntityDamageCause.contact,
                            damagingEntity: player
                        });
                        target.applyImpulse({ x: viewDir.x * 0.5, y: 0.3, z: viewDir.z * 0.5 });
                        player.dimension.playSound("item.trident.hit", target.location);
                    }
                    duration--;
                }, 1);
            }
        }
    });
});

// ==========================================
// 2. REGISTRASI DYNAMIC PROPERTIES
// ==========================================
world.beforeEvents.worldInitialize.subscribe((event) => {
    const propertyDef = new DynamicPropertiesDefinition();
    propertyDef.defineNumber("chaos:lastSneak");
    propertyDef.defineBoolean("chaos:wasSneaking");
    
    event.propertyRegistry.registerEntityTypeDynamicProperties(propertyDef, "minecraft:player");
});

// ==========================================
// 3. EVENT KETIKA ENTITY MEMUKUL ENTITY LAIN
// ==========================================
world.afterEvents.entityHitEntity.subscribe((event) => {
    const { damagingEntity, hitEntity } = event;

    if (damagingEntity.typeId !== "minecraft:player") return;

    const equippable = damagingEntity.getComponent(ItemComponentTypes.Equippable);
    if (!equippable) return;

    const mainhandItem = equippable.getEquipment(EquipmentSlot.Mainhand);
    if (!mainhandItem) return;

    // Logika Spear (Lunge)
    if (mainhandItem.hasComponent("chaos:spear_controller")) {
        damagingEntity.addEffect("saturation", 2, { amplifier: 0, showParticles: false });

        const enchantable = mainhandItem.getComponent(ItemComponentTypes.Enchantable);
        let extraDamage = 0;

        if (enchantable) {
            const lungeEnchant = enchantable.getEnchantment("lunge"); 
            if (lungeEnchant) {
                const baseDamage = 8; 
                extraDamage = (baseDamage * 3) * lungeEnchant.level;
            }
        }

        if (extraDamage > 0) {
            system.run(() => {
                hitEntity.applyDamage(extraDamage, { cause: EntityDamageCause.entityAttack, damagingEntity: damagingEntity });
            });
        }
    }

    // Logika Mace (Smash)
    if (mainhandItem.hasComponent("chaos:mace_controller")) {
        const targetLoc = hitEntity.location;

        damagingEntity.applyImpulse({ x: 0, y: 0.8, z: 0 }); 
        damagingEntity.dimension.playSound("item.mace.smash_ground", targetLoc);
        damagingEntity.dimension.spawnParticle("minecraft:wind_explosion_emitter", targetLoc);

        const nearbyEntities = damagingEntity.dimension.getEntities({ location: targetLoc, maxDistance: 3 });
        for (const entity of nearbyEntities) {
            if (entity.id !== damagingEntity.id && entity.id !== hitEntity.id) {
                const dx = entity.location.x - targetLoc.x;
                const dz = entity.location.z - targetLoc.z;
                entity.applyImpulse({ x: dx * 0.3, y: 0.4, z: dz * 0.3 });
                
                system.run(() => {
                    entity.applyDamage(5, { cause: EntityDamageCause.entityAttack, damagingEntity: damagingEntity });
                });
            }
        }
    }
});

// ==========================================
// 4. EVENT SHIELD BLOCK (MENGGUNAKAN CHAOS SHIELD)
// ==========================================
world.beforeEvents.entityDamage.subscribe((event) => {
    const entity = event.entity;

    if (entity.typeId === "minecraft:player" && entity.isSneaking) {
        const equippable = entity.getComponent(ItemComponentTypes.Equippable);
        if (!equippable) return;

        const offhand = equippable.getEquipment(EquipmentSlot.Offhand);
        const mainhand = equippable.getEquipment(EquipmentSlot.Mainhand);
        
        // Memeriksa custom shield berdasarkan component atau typeId
        const hasShield = (offhand && (offhand.typeId === "chaos:shield" || offhand.hasComponent("chaos:shield_controller"))) || 
                          (mainhand && (mainhand.typeId === "chaos:shield" || mainhand.hasComponent("chaos:shield_controller")));

        if (hasShield) {
            event.cancel = true; 
            system.run(() => {
                entity.playSound("item.shield.block");
            });
        }
    }
});

// ==========================================
// 5. EVENT ITEM USE (UNTUK CHARGING SPEAR)
// ==========================================
world.afterEvents.itemStartUse.subscribe((event) => {
    if (event.itemStack?.hasComponent("chaos:spear_controller")) chargingPlayers.add(event.source.id);
});
world.afterEvents.itemStopUse.subscribe((event) => chargingPlayers.delete(event.source.id));
world.afterEvents.itemReleaseUse.subscribe((event) => chargingPlayers.delete(event.source.id));

// ==========================================
// FUNGSI BANTUAN ENCHANT
// ==========================================
function enchantItem(player, slot, enchantments) {
    const equippable = player.getComponent(ItemComponentTypes.Equippable);
    if (!equippable) return;

    const item = equippable.getEquipment(slot);
    if (!item) return;

    const enchantable = item.getComponent(ItemComponentTypes.Enchantable);
    if (!enchantable) return;

    for (const ench of enchantments) {
        enchantable.addEnchantment({ type: ench.type, level: ench.level });
    }
    
    equippable.setEquipment(slot, item);
}

// ==========================================
// 6. MAIN TICK LOOP (Berjalan setiap 2 tick)
// ==========================================
system.runInterval(() => {
    const currentTick = system.currentTick;

    for (const player of world.getAllPlayers()) {
        
        // --- Sistem Trigger Enchantment ---
        const tags = player.getTags();
        if (tags.includes("chaos_enchant_trigger")) {
            player.removeTag("chaos_enchant_trigger");

            enchantItem(player, EquipmentSlot.Mainhand, [
                { type: "sharpness", level: 5 },
                { type: "unbreaking", level: 3 },
                { type: "mending", level: 1 }
            ]);
            
            player.sendMessage("§a[ChaosPVP] Semua perlengkapanmu telah di-enchant!");
        }

        // --- Sistem Charging Spear (Maju Cepat) ---
        if (chargingPlayers.has(player.id)) {
            player.addEffect("speed", 5, { amplifier: 1, showParticles: false });
            const velocity = player.getVelocity();
            const location = player.location;
            
            if ((velocity.x * velocity.x + velocity.z * velocity.z) > 0.01) {
                const viewDir = player.getViewDirection();
                const frontBlockLoc = {
                    x: Math.floor(location.x + viewDir.x),
                    y: Math.floor(location.y),
                    z: Math.floor(location.z + viewDir.z)
                };
                
                const dimension = player.dimension;
                const frontBlock = dimension.getBlock(frontBlockLoc);
                const blockAboveFront = dimension.getBlock({ x: frontBlockLoc.x, y: frontBlockLoc.y + 1, z: frontBlockLoc.z });
                const blockAbovePlayer = dimension.getBlock({ x: location.x, y: location.y + 2, z: location.z });

                if (frontBlock && !frontBlock.isAir && !frontBlock.isLiquid && blockAboveFront?.isAir && blockAbovePlayer?.isAir) {
                    player.applyImpulse({ x: velocity.x * 1.2, y: 0.45, z: velocity.z * 1.2 });
                }
            }
        }

        // --- Sistem Sneaking (Double Sneak Trigger) ---
        const isSneaking = player.isSneaking;
        const lastSneak = player.getDynamicProperty("chaos:lastSneak") ?? 0;
        const wasSneaking = player.getDynamicProperty("chaos:wasSneaking") ?? false;

        if (isSneaking && !wasSneaking) {
            // Jika pemain melakukan double-sneak dalam rentang waktu 12 tick
            if (currentTick - lastSneak <= 12) { 
                const equippable = player.getComponent(ItemComponentTypes.Equippable);
                const mainhand = equippable?.getEquipment(EquipmentSlot.Mainhand);
                
                if (mainhand) {
                    // Panggil Naga jika memegang chaos:shield atau item dengan chaos:shield_controller
                    if (mainhand.typeId === "chaos:shield" || mainhand.hasComponent("chaos:shield_controller")) {
                        const spawnLoc = { x: player.location.x, y: player.location.y + 6, z: player.location.z };
                        const dragon = player.dimension.spawnEntity("minecraft:ender_dragon", spawnLoc);
                        dragon.nameTag = "Ghost Dragon";
                        dragon.addEffect("resistance", 100, { amplifier: 255, showParticles: false }); 
                        
                        activeDragons.set(dragon.id, { entity: dragon, ticksLeft: 100, loc: spawnLoc, ownerId: player.id });
                    }
                    // Lompatan Angin jika memegang mace buatanmu
                    else if (mainhand.hasComponent("chaos:mace_controller")) {
                        const loc = player.location;
                        player.applyImpulse({ x: 0, y: 1.5, z: 0 });
                        player.dimension.playSound("item.wind_charge.use", loc);
                        player.dimension.spawnParticle("minecraft:wind_explosion_emitter", { x: loc.x, y: loc.y - 0.5, z: loc.z });
                        player.addEffect("slow_falling", 20, { amplifier: 0, showParticles: false });
                    }
                }
            }
            player.setDynamicProperty("chaos:lastSneak", currentTick);
        }
        
        if (isSneaking !== wasSneaking) {
            player.setDynamicProperty("chaos:wasSneaking", isSneaking);
        }
    }

    // --- Eksekusi Ghost Dragon ---
    for (const [dragonId, dragonData] of activeDragons.entries()) {
        const { entity, ticksLeft, loc, ownerId } = dragonData;
        
        if (ticksLeft <= 0 || !entity.isValid()) {
            if (entity.isValid()) entity.remove();
            activeDragons.delete(dragonId);
            continue;
        }

        entity.teleport(loc, { facingLocation: { x: loc.x, y: loc.y - 1, z: loc.z } });

        const entitiesNear = entity.dimension.getEntities({ location: loc, maxDistance: 12 });
        for (const target of entitiesNear) {
            if (target.id === ownerId || target.id === dragonId || target.typeId === "minecraft:item") continue;
            
            const dx = loc.x - target.location.x;
            const dy = loc.y - target.location.y;
            const dz = loc.z - target.location.z;
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            if (distance > 1.5) { 
                const pullStrength = Math.min(0.15, distance * 0.02); 
                target.applyImpulse({ x: (dx/distance) * pullStrength, y: (dy/distance) * pullStrength, z: (dz/distance) * pullStrength });
            } else {
                target.applyDamage(2, { cause: EntityDamageCause.magic });
            }
        }
        dragonData.ticksLeft -= 2; 
    }
}, 2);