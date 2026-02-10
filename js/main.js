// SOS Fiche de Paie - Main JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    
    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', function() {
            mobileMenu.classList.toggle('hidden');
            const icon = mobileMenuBtn.querySelector('i');
            if (mobileMenu.classList.contains('hidden')) {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            } else {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            }
        });
        
        // Close mobile menu when clicking on a link
        const mobileLinks = mobileMenu.querySelectorAll('a');
        mobileLinks.forEach(link => {
            link.addEventListener('click', function() {
                mobileMenu.classList.add('hidden');
                const icon = mobileMenuBtn.querySelector('i');
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            });
        });
    }
    
    // Navbar scroll effect
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
    
    // Elements
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    const analyzeBtn = document.getElementById('analyzeBtn');
    
    let selectedFiles = [];
    
    // Drag and drop functionality
    uploadZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadZone.classList.add('border-blue-600', 'bg-blue-50');
    });
    
    uploadZone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        uploadZone.classList.remove('border-blue-600', 'bg-blue-50');
    });
    
    uploadZone.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadZone.classList.remove('border-blue-600', 'bg-blue-50');
        
        const files = Array.from(e.dataTransfer.files);
        handleFiles(files);
    });
    
    // Click to upload
    uploadZone.addEventListener('click', function(e) {
        if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
            fileInput.click();
        }
    });
    
    // File input change
    fileInput.addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        handleFiles(files);
    });
    
    // Handle files
    function handleFiles(files) {
        // Filter valid files
        const validFiles = files.filter(file => {
            const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
            const maxSize = 10 * 1024 * 1024; // 10 Mo
            
            if (!validTypes.includes(file.type)) {
                alert(`Le fichier "${file.name}" n'est pas au bon format. Formats acceptés : PDF, JPG, PNG`);
                return false;
            }
            
            if (file.size > maxSize) {
                alert(`Le fichier "${file.name}" est trop volumineux. Taille maximale : 10 Mo`);
                return false;
            }
            
            return true;
        });
        
        if (validFiles.length > 0) {
            selectedFiles = [...selectedFiles, ...validFiles];
            displayFiles();
        }
    }
    
    // Display selected files
    function displayFiles() {
        if (selectedFiles.length === 0) {
            fileList.classList.add('hidden');
            analyzeBtn.classList.add('hidden');
            return;
        }
        
        fileList.classList.remove('hidden');
        analyzeBtn.classList.remove('hidden');
        
        fileList.innerHTML = '<h4 class="font-semibold text-gray-900 mb-3">Fichiers sélectionnés :</h4>';
        
        selectedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'flex items-center justify-between bg-blue-50 rounded-lg p-3 border border-blue-200';
            
            const fileInfo = document.createElement('div');
            fileInfo.className = 'flex items-center space-x-3 flex-1';
            
            const icon = getFileIcon(file.type);
            const fileName = document.createElement('span');
            fileName.className = 'text-sm text-gray-700 truncate';
            fileName.textContent = file.name;
            
            const fileSize = document.createElement('span');
            fileSize.className = 'text-xs text-gray-500';
            fileSize.textContent = formatFileSize(file.size);
            
            fileInfo.innerHTML = `<i class="${icon} text-blue-600 text-xl"></i>`;
            fileInfo.appendChild(fileName);
            fileInfo.appendChild(fileSize);
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'text-red-500 hover:text-red-700 transition';
            removeBtn.innerHTML = '<i class="fas fa-times"></i>';
            removeBtn.onclick = function() {
                removeFile(index);
            };
            
            fileItem.appendChild(fileInfo);
            fileItem.appendChild(removeBtn);
            fileList.appendChild(fileItem);
        });
    }
    
    // Get file icon based on type
    function getFileIcon(type) {
        if (type === 'application/pdf') {
            return 'fas fa-file-pdf';
        } else if (type.startsWith('image/')) {
            return 'fas fa-file-image';
        }
        return 'fas fa-file';
    }
    
    // Format file size
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    // Remove file
    function removeFile(index) {
        selectedFiles.splice(index, 1);
        displayFiles();
    }
    
    // Analyze button click
    analyzeBtn.addEventListener('click', async function() {
        if (selectedFiles.length === 0) {
            alert('Veuillez sélectionner au moins un fichier.');
            return;
        }

        // Show loading state
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Upload en cours...';

        try {
            // ÉTAPE 1: Upload du fichier
            const formData = new FormData();
            formData.append('file', selectedFiles[0]); // Premier fichier seulement pour l'instant

            const uploadResponse = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                let errorMsg = "Erreur lors de l'upload";
                try {
                    const error = await uploadResponse.json();
                    errorMsg = error.error || errorMsg;
                } catch {
                    // Response not JSON (e.g. 504 HTML page)
                }
                throw new Error(errorMsg);
            }

            const uploadData = await uploadResponse.json();
            console.log('Fichier uploadé:', uploadData);

            // ÉTAPE 2: Lancer l'analyse
            analyzeBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Analyse en cours (peut prendre jusqu'à 60s)...`;

            const analyzeResponse = await fetch('/api/analyze', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ fileId: uploadData.fileId })
            });

            if (!analyzeResponse.ok) {
                let errorMsg = "Erreur lors de l'analyse";
                try {
                    const error = await analyzeResponse.json();
                    errorMsg = error.error || errorMsg;
                } catch {
                    if (analyzeResponse.status === 504) {
                        errorMsg = "L'analyse a pris trop de temps. Veuillez réessayer avec une image plus légère.";
                    }
                }
                throw new Error(errorMsg);
            }

            const analysisData = await analyzeResponse.json();
            console.log('Analyse terminée:', analysisData);

            // ÉTAPE 3: Afficher les résultats
            showResultModal(analysisData);

        } catch (error) {
            console.error('Erreur:', error);
            alert(`Erreur: ${error.message}`);
        } finally {
            // Reset button
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="fas fa-search mr-2"></i>Analyser mes bulletins de paie';
        }
    });
    
    // Show result modal (avec vraies données de l'API)
    function showResultModal(analysisData) {
        // Utiliser les vraies données de l'analyse
        const nombreAnomalies = analysisData.nombre_anomalies || 0;
        const gainAnnuel = Math.round(analysisData.gain_annuel || 0);
        const gainTotal = Math.round(analysisData.gain_total_potentiel || 0);
        const prixRapport = analysisData.prix_rapport || 19;
        const analysisId = analysisData.analysisId;

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl transform animate-scale-in">
                <div class="space-y-5">
                    <!-- Header -->
                    <div class="text-center">
                        <div class="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="fas fa-check text-4xl text-blue-600"></i>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-900">💰 Analyse terminée !</h3>
                    </div>

                    <!-- Résultats TEASER -->
                    <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-5 border border-blue-200">
                        <p class="text-gray-700 mb-3">
                            Notre IA a détecté <strong class="text-blue-600">${nombreAnomalies} anomalie(s)</strong> potentielle(s) sur vos bulletins de paie.
                        </p>
                        <div class="grid grid-cols-2 gap-3 text-center">
                            <div class="bg-white rounded-lg p-3">
                                <p class="text-xs text-gray-600">Par an</p>
                                <p class="text-2xl font-bold text-blue-600">${gainAnnuel} €</p>
                            </div>
                            <div class="bg-white rounded-lg p-3">
                                <p class="text-xs text-gray-600">Total potentiel</p>
                                <p class="text-2xl font-bold text-blue-600">${gainTotal} €</p>
                            </div>
                        </div>
                    </div>

                    <!-- Prix barré - Offre gratuite -->
                    <div class="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-5 border-2 border-green-300">
                        <div class="text-center">
                            <p class="text-sm text-gray-700 mb-2">🎁 Rapport complet détaillé</p>
                            <p class="text-3xl font-bold">
                                <span class="line-through text-gray-400">${prixRapport}€</span>
                                <span class="text-green-600 ml-2">→ GRATUIT</span>
                            </p>
                            <p class="text-xs text-gray-600 mt-2 italic">Offre de lancement - Votre satisfaction nous amènera des clients</p>
                        </div>
                    </div>

                    <!-- Formulaire Prénom + Email -->
                    <div class="border-t pt-4">
                        <p class="font-semibold text-gray-900 mb-3 text-center">
                            📧 Recevez votre rapport complet par email :
                        </p>
                        <form id="emailForm" class="space-y-3">
                            <div>
                                <input
                                    type="text"
                                    id="prenomInput"
                                    placeholder="Votre prénom"
                                    required
                                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
                                />
                            </div>
                            <div>
                                <input
                                    type="email"
                                    id="emailInput"
                                    placeholder="votre@email.com"
                                    required
                                    class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
                                />
                            </div>
                            <button
                                type="submit"
                                class="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold px-6 py-4 rounded-lg transition-all duration-300 transform hover:scale-[1.02] shadow-lg"
                            >
                                <i class="fas fa-envelope mr-2"></i>RECEVOIR MON RAPPORT GRATUIT
                            </button>
                        </form>

                        <p class="text-xs text-gray-500 text-center mt-3">
                            <i class="fas fa-lock mr-1"></i>Vos données sont 100% sécurisées et confidentielles
                        </p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Gestion du formulaire
        const form = document.getElementById('emailForm');
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            const prenom = document.getElementById('prenomInput').value.trim();
            const email = document.getElementById('emailInput').value.trim();

            // Validation basique
            if (!prenom || prenom.length < 2) {
                alert('Veuillez entrer un prénom valide (minimum 2 caractères)');
                return;
            }

            if (!email || !email.includes('@')) {
                alert('Veuillez entrer une adresse email valide');
                return;
            }

            // Envoi du rapport via l'API
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Envoi en cours...';

            // Appel API pour envoyer le rapport
            fetch('/api/send-report', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    analysisId: analysisId,
                    prenom: prenom,
                    email: email
                })
            })
            .then(async res => {
                if (!res.ok) {
                    let errorMsg = 'Erreur serveur';
                    try {
                        const err = await res.json();
                        errorMsg = err.error || errorMsg;
                    } catch {
                        if (res.status === 504) {
                            errorMsg = 'Le serveur a mis trop de temps à répondre. Veuillez réessayer.';
                        }
                    }
                    throw new Error(errorMsg);
                }
                return res.json();
            })
            .then(data => {
                // Afficher la confirmation
                modal.innerHTML = `
                    <div class="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl transform animate-scale-in">
                        <div class="text-center space-y-4">
                            <div class="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                                <i class="fas fa-check text-4xl text-green-600"></i>
                            </div>
                            <h3 class="text-2xl font-bold text-gray-900">✅ Rapport envoyé !</h3>
                            <p class="text-gray-600">
                                Votre rapport complet a été envoyé à <strong class="text-blue-600">${email}</strong>
                            </p>
                            <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                <p class="text-sm text-gray-700">
                                    <i class="fas fa-info-circle text-blue-600 mr-2"></i>
                                    Vérifiez votre boîte mail dans quelques instants. N'oubliez pas de consulter vos spams si vous ne le trouvez pas.
                                </p>
                            </div>
                            <button onclick="this.closest('.fixed').remove()" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-all duration-300 w-full">
                                Fermer
                            </button>
                        </div>
                    </div>
                `;
            })
            .catch(error => {
                console.error('Erreur envoi rapport:', error);
                alert(`Erreur lors de l'envoi du rapport: ${error.message}`);
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-envelope mr-2"></i>RECEVOIR MON RAPPORT GRATUIT';
            });
        });

        // Close on click outside
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }
    
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-fade-in');
            }
        });
    }, observerOptions);
    
    // Observe sections
    document.querySelectorAll('section').forEach(section => {
        observer.observe(section);
    });
});

// Add animation styles dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes scale-in {
        from {
            transform: scale(0.9);
            opacity: 0;
        }
        to {
            transform: scale(1);
            opacity: 1;
        }
    }
    
    .animate-scale-in {
        animation: scale-in 0.3s ease-out;
    }
    
    @keyframes fade-in {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .animate-fade-in {
        animation: fade-in 0.6s ease-out;
    }
`;
document.head.appendChild(style);
