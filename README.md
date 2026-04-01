# 🌮 Note Ton Tacos

Ceci est une plateforme communautaire et interactive pour trouver, noter et partager les meilleures recettes de French Tacos. 

## 🚀 Comment déployer sur un serveur (Production)

L'application est entièrement dockérisée pour être déployée très facilement par n'importe qui sur un serveur (ex: VPS OVH, serveur local, Raspberry Pi...).

Le fonctionnement interne est géré par du Node.JS / Express avec une base de données **SQLite** (il n'y a donc pas besoin d'installer de gros moteur de base de données comme PostgreSQL ou MySQL).

### Prérequis sur le serveur

1. Avoir **Docker** installé
2. Avoir **Docker Compose** installé

### Lancement

Cloner ou déposer ce code source sur votre serveur.
Dans ce dossier (à la racine là où se trouve le fichier `docker-compose.yml`), créez un fichier de base de données vide pour Docker :

```bash
touch backend/tacos.sqlite
```

Ensuite, lancez la stack :

```bash
docker-compose up -d --build
```

Et voilà ! 🎉 L'application tournera en arrière-plan sur le **port 8000** de la machine. 
* Pour y accéder depuis le web : `http://VOTRE_IP:8000` (ou vous pouvez l'associer à un nom de domaine via un Reverse Proxy comme Nginx ou Traefik).

### Sauvegarde

Toutes les données (utilisateurs, recettes, notes...) sont sauvegardées en temps réel dans le fichier `backend/tacos.sqlite`.
Pour faire une sauvegarde de tout le site, il vous suffit de copier ce seul et unique fichier : `tacos.sqlite`.

---

## 🛠 Mode Développement (Local)

Si vous voulez modifier le code en direct sur votre poste de travail :

1. Allez dans le dossier backend : `cd backend`
2. Installez les packages : `npm install`
3. Lancez le serveur : `npm start`
4. L'application est alors accessible sur le port 3000 de votre interface locale (`http://localhost:3000`). Mettre à jour des fichiers HTML/CSS/JS se répercute instantanément lors d'une simple actualisation du navigateur.
