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
    analyzeBtn.addEventListener('click', function() {
        if (selectedFiles.length === 0) {
            alert('Veuillez sélectionner au moins un fichier.');
            return;
        }
        
        // Show loading state
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Analyse en cours...';
        
        // Simulate analysis (replace with actual API call)
        setTimeout(function() {
            // Show success message
            showResultModal();
            
            // Reset button
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="fas fa-search mr-2"></i>Analyser mes bulletins de paie';
        }, 2000);
    });
    
    // Show result modal (demo)
    function showResultModal() {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl transform animate-scale-in">
                <div class="text-center space-y-4">
                    <div class="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                        <i class="fas fa-check text-4xl text-blue-600"></i>
                    </div>
                    <h3 class="text-2xl font-bold text-gray-900">Analyse terminée !</h3>
                    <p class="text-gray-600">
                        Notre IA a détecté <strong class="text-blue-600">${Math.floor(Math.random() * 5) + 1} anomalie(s)</strong> potentielle(s) sur vos bulletins de paie.
                    </p>
                    <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <p class="text-sm text-gray-700">
                            Montant potentiellement récupérable :
                        </p>
                        <p class="text-3xl font-bold text-blue-600 mt-2">
                            ${Math.floor(Math.random() * 2000) + 500} €
                        </p>
                    </div>
                    <p class="text-sm text-gray-600">
                        Un rapport détaillé va être généré et envoyé à votre adresse email.
                    </p>
                    <button onclick="this.closest('.fixed').remove()" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-all duration-300 w-full">
                        Fermer
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
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
