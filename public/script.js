// NAVIGATION 
function toggleOverlayMenu() {
    const overlayMenu = document.getElementById("fullScreenMenu");
    if (overlayMenu) {
        const isCurrentlyOpen = overlayMenu.classList.contains("open");
        
        if (!isCurrentlyOpen) {
            overlayMenu.classList.add("open");
            document.body.classList.add("modal-open"); // Freezes background scroll
        } else {
            overlayMenu.classList.remove("open");
            document.body.classList.remove("modal-open"); // Unfreezes scrolling
        }
    }
}

// Global Nav Shrink Header Metric Tracker
window.addEventListener("scroll", function () {
    const navbar = document.querySelector(".navbar");
    if (navbar) {
        if (window.scrollY > 50) {
            navbar.classList.add("shrink");
        } else {
            navbar.classList.remove("shrink");
        }
    }
});

let currentSlide = 0;

function showSlide(index) {
    const track = document.querySelector(".carousel-track");
    const dots = document.querySelectorAll(".dot");
    const slides = document.querySelectorAll(".slide");

    if (!track || slides.length === 0) return;

    if (index >= slides.length) currentSlide = 0;
    else if (index < 0) currentSlide = slides.length - 1;
    else currentSlide = index;

    // Smooth CSS-driven transforms
    track.style.transform = `translateX(-${currentSlide * 100}%)`;

    dots.forEach(d => d.classList.remove("active"));
    if (dots[currentSlide]) {
        dots[currentSlide].classList.add("active");
    }
}


function autoSlide() {
    showSlide(currentSlide + 1);
}


// APY INTERSECTION CONTROLLER ENGINE 

const eliteSection = document.querySelector(".elite-section");
const apyValueElement = document.querySelector(".apy-value");
let hasAnimated = false;

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !hasAnimated) {
            hasAnimated = true;
            animateAPY();
        }
    });
}, { threshold: 0.25 });

if (eliteSection) {
    observer.observe(eliteSection);
}

function animateAPY() {
    if (!apyValueElement) return;

    let start = 0.00;
    let end = 3.35;
    let duration = 1200;
    let startTime = null;

    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        let progress = timestamp - startTime;

        let t = Math.min(progress / duration, 1);
        let eased = 1 - Math.pow(1 - t, 3); // Smooth Ease-Out Cubic

        apyValueElement.textContent = (start + (end - start) * eased).toFixed(2) + "%";

        if (t < 1) {
            requestAnimationFrame(step);
        }
    }
    requestAnimationFrame(step);
}

// Reset page constraints on refresh cleanly
window.onbeforeunload = function () { window.scrollTo(0, 0); };


// ==========================================================================
// DOM INITIALIZATION LAYERS
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    
    // Initialize Carousel immediately if present
    if (document.querySelector(".carousel-track")) {
        showSlide(0);
        setInterval(autoSlide, 4000);
    }

    // Horizontal Action Bar Link Tracker Matrix
    const links = document.querySelectorAll(".nav-links a");
    links.forEach(link => {
        link.addEventListener("click", function () {
            links.forEach(l => l.classList.remove("active"));
            this.classList.add("active");
        });
    });

    
    
    // Fixed WhatsApp scroll detection class name mismatch
    let lastScrollY = window.scrollY;
    const whatsappTrigger = document.querySelector(".whatsapp-floating-btn, .whatsapp-float-trigger");

    window.addEventListener("scroll", () => {
        if (whatsappTrigger) {
            if (window.scrollY > lastScrollY) {
                whatsappTrigger.style.transform = "scale(0.95)";
                whatsappTrigger.style.opacity = "0.85";
            } else {
                whatsappTrigger.style.transform = "scale(1)";
                whatsappTrigger.style.opacity = "1";
            }
            lastScrollY = window.scrollY;
        }
    }, { passive: true });
});