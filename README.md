# Babyfoot Néon

Babyfoot multijoueur en ligne, jouable dans le navigateur. TypeScript, Vite, PixiJS, serveur Node.js autoritaire.

## Lancer

```bash
npm install
npm run dev        # client (http://localhost:5173) + serveur (ws://localhost:2567)
```

Autres commandes :

```bash
npm test           # tests de la physique partagée
npm run typecheck  # vérification TypeScript des 3 packages
npm run build      # build de production du client
```

Node.js ≥ 22.12 requis.

## Structure

```
packages/shared   physique déterministe (pas fixe 120 Hz, collisions continues), constantes, bot
packages/client   rendu PixiJS 2.5D, entrées clavier, HUD, sons WebAudio, mode entraînement
packages/server   serveur WebSocket (squelette ; salons et netcode au jalon 3)
```

La simulation (`packages/shared`) est la même côté client et serveur : le serveur fera autorité et le client s'en servira pour la prédiction.

## Contrôles (entraînement)

| Touche | Action |
| --- | --- |
| Trackpad / souris | Cliquer une fois sur le jeu, puis glisser le doigt sans appuyer : haut/bas = barre, gauche/droite = joueurs. `Échap` pour quitter |
| `W` / `S` (Z/S en AZERTY) | Monter / descendre la barre active |
| `←` / `→` | Rotation des joueurs : passe, dribble, amorti |
| `↓` | Lever les joueurs pour laisser passer la balle |
| `Espace` / `↑` | Tir : appui court = frappe rapide, maintenu = frappe chargée (jauge) |
| `Shift` | Contrôle : colle la balle au pied, 1,5 s max |
| `Tab` / `Q` / `E` | Changer de barre (sinon sélection auto de la barre la plus proche) |
| `R` | Réengager la balle |
| `B` | Activer / couper le bot adverse |
| `H` | Afficher / masquer l'aide |

Les touches utilisent `event.code` (position physique) : même disposition en AZERTY et QWERTY.

## Jalons

1. ✅ Physique + contrôles en solo
2. Règles : reprise interdite, pierre-feuille-ciseaux au milieu, gamelle, victoire à 10
3. Réseau 2 v 2 : salons privés, matchmaking, prédiction / réconciliation, ping
4. Mode 4 v 4 + roue de tirage au sort
5. Polish visuel et sonore, replay, bots, remap / manette

## Réglages physiques

Toutes les constantes (vitesse des barres, puissance de frappe, restitution, durée de contrôle…) sont dans `packages/shared/src/constants.ts`.
