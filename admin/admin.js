import { db } from '../firebase-config.js';
import { collection, addDoc, getDocs, doc, setDoc, query, where, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- PASSWORD PROTECTION ---
const correctPassword = "123"; // Change this to a secure password
const passwordModal = document.getElementById('password-modal');
const mainContent = document.getElementById('main-content');
const loginButton = document.getElementById('login-button');
const passwordInput = document.getElementById('admin-password');

loginButton.addEventListener('click', () => {
    if (passwordInput.value === correctPassword) {
        passwordModal.style.display = 'none';
        mainContent.style.display = 'block';
        loadAdminData();
    } else {
        alert('Incorrect Password!');
    }
});

// --- ELEMENTS ---
const addStudentBtn = document.getElementById('add-student-btn');
const addStallBtn = document.getElementById('add-stall-btn');
const addProductBtn = document.getElementById('add-product-btn');
const stallSelect = document.getElementById('stall-select');
const salesReportDiv = document.getElementById('sales-report');
const transactionLogDiv = document.getElementById('transaction-log');

// --- QR CODE DISPLAY ---
const qrDisplay = document.getElementById('qr-display');
const qrCodeEl = document.getElementById('qrcode');
const qrTitle = document.getElementById('qr-title');
const qrLink = document.getElementById('qr-link');
const qrcode = new QRCode(qrCodeEl, {
    width: 200,
    height: 200
});

// --- FUNCTIONS ---

// Generate a unique ID
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Show QR Code
function showQRCode(type, id, name) {
    const baseURL = window.location.origin;
    const path = type === 'student' ? '/student/student.html' : '/stall/stall.html';
    const url = `${baseURL}${path}?id=${id}`;

    qrTitle.textContent = `QR Code for ${name}`;
    qrcode.makeCode(url);
    qrLink.value = url;
    qrDisplay.style.display = 'block';

    alert(`${type.charAt(0).toUpperCase() + type.slice(1)} "${name}" added successfully!`);
}

// Add a new student to Firestore
addStudentBtn.addEventListener('click', async () => {
    const name = document.getElementById('student-name').value.trim();
    const balance = parseFloat(document.getElementById('initial-balance').value);

    if (!name || isNaN(balance)) {
        alert('Please enter a valid name and initial balance.');
        return;
    }

    try {
        const studentId = `stu_${generateUniqueId()}`;
        await setDoc(doc(db, "users", studentId), {
            id: studentId,
            name: name,
            balance: balance,
            role: 'student',
            createdAt: new Date()
        });
        showQRCode('student', studentId, name);
        document.getElementById('student-name').value = '';
        document.getElementById('initial-balance').value = '';
    } catch (e) {
        console.error("Error adding student: ", e);
        alert('Error adding student. See console for details.');
    }
});

// Add a new stall to Firestore
addStallBtn.addEventListener('click', async () => {
    const name = document.getElementById('stall-name').value.trim();
    if (!name) {
        alert('Please enter a stall name.');
        return;
    }

    try {
        const stallId = `stall_${generateUniqueId()}`;
        await setDoc(doc(db, "users", stallId), {
            id: stallId,
            name: name,
            role: 'stall',
            createdAt: new Date()
        });
        showQRCode('stall', stallId, name);
        document.getElementById('stall-name').value = '';
        loadStallsForDropdown(); // Refresh dropdown
    } catch (e) {
        console.error("Error adding stall: ", e);
        alert('Error adding stall. See console for details.');
    }
});

// Add a product to a stall
addProductBtn.addEventListener('click', async () => {
    const stallId = stallSelect.value;
    const productName = document.getElementById('product-name').value.trim();
    const productPrice = parseFloat(document.getElementById('product-price').value);

    if (!stallId || !productName || isNaN(productPrice)) {
        alert('Please select a stall and enter valid product details.');
        return;
    }

    try {
        const productId = `prod_${generateUniqueId()}`;
        await addDoc(collection(db, "products"), {
            id: productId,
            stallId: stallId,
            name: productName,
            price: productPrice,
        });
        alert(`Product "${productName}" added to the stall!`);
        document.getElementById('product-name').value = '';
        document.getElementById('product-price').value = '';
    } catch (e) {
        console.error("Error adding product: ", e);
    }
});


// Load all stalls into the dropdown
async function loadStallsForDropdown() {
    stallSelect.innerHTML = '<option value="">-- Select a Stall --</option>';
    const q = query(collection(db, "users"), where("role", "==", "stall"));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
        const stall = doc.data();
        const option = document.createElement('option');
        option.value = stall.id;
        option.textContent = stall.name;
        stallSelect.appendChild(option);
    });
}

// Load reports and logs
function loadAdminData() {
    loadStallsForDropdown();

    // Listen for real-time transaction updates
    const transactionsQuery = collection(db, "transactions");
    onSnapshot(transactionsQuery, (snapshot) => {
        const transactions = [];
        const salesByStall = {};

        snapshot.forEach(doc => {
            const tx = doc.data();
            transactions.push(tx);

            if (!salesByStall[tx.stallName]) {
                salesByStall[tx.stallName] = 0;
            }
            salesByStall[tx.stallName] += tx.totalAmount;
        });

        // Update Sales Report
        salesReportDiv.innerHTML = '';
        for (const stallName in salesByStall) {
            salesReportDiv.innerHTML += `
                <div class="flex justify-between items-center p-2 bg-gray-100 rounded">
                    <span class="font-medium">${stallName}</span>
                    <span class="font-bold text-green-600">₹${salesByStall[stallName].toFixed(2)}</span>
                </div>
            `;
        }

        // Update Transaction Log
        transactionLogDiv.innerHTML = '';
        transactions.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis()); // Sort by newest first
        transactions.forEach(tx => {
            transactionLogDiv.innerHTML += `
                <div class="p-1 border-b text-sm">
                   <p><strong>${tx.studentName}</strong> bought from <strong>${tx.stallName}</strong></p>
                   <p>Item: ${tx.productName} (x${tx.quantity}) - Total: ₹${tx.totalAmount.toFixed(2)}</p>
                   <p class="text-xs text-gray-500">${new Date(tx.timestamp.toMillis()).toLocaleString()}</p>
                </div>
            `;
        });
    });
}
