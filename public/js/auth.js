// 认证相关功能
const API_BASE_URL = `${window.location.protocol}//${window.location.host}/api`;

// 检查登录状态
function checkLogin() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (!token || !user.id) {
        window.location.href = 'login.html';
        return null;
    }
    
    return { token, user };
}

// 登录功能
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const role = document.getElementById('role').value;
            
            try {
                const response = await fetch(`${API_BASE_URL}/auth/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // 检查用户角色是否匹配
                    if (data.user.role !== role) {
                        showMessage('登录失败：角色不匹配', 'error');
                        return;
                    }
                    
                    // 保存token和用户信息
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    
                    // 根据角色跳转到不同页面
                    if (data.user.role === 'student') {
                        window.location.href = 'student.html';
                    } else if (data.user.role === 'teacher') {
                        window.location.href = 'teacher.html';
                    } else {
                        window.location.href = 'index.html';
                    }
                } else {
                    showMessage('登录失败：' + data.error, 'error');
                }
            } catch (error) {
                showMessage('网络错误，请检查服务器连接', 'error');
                console.error('登录错误:', error);
            }
        });
    }
    
    // 注册功能
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = {
                username: document.getElementById('regUsername').value,
                password: document.getElementById('password').value,
                email: document.getElementById('email').value,
                real_name: document.getElementById('fullName').value,
                role: document.getElementById('role').value,
                student_number: document.getElementById('studentId').value,
                department: document.getElementById('department').value,
                phone: ''
            };
            
            // 验证密码
            const confirmPassword = document.getElementById('confirmPassword').value;
            if (formData.password !== confirmPassword) {
                showMessage('两次输入的密码不一致', 'error');
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE_URL}/auth/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showMessage('注册成功！请登录', 'success');
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 2000);
                } else {
                    showMessage('注册失败：' + data.error, 'error');
                }
            } catch (error) {
                showMessage('网络错误，请检查服务器连接', 'error');
                console.error('注册错误:', error);
            }
        });
    }
    
    // 登出功能
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        });
    }
    
    // 显示用户名
    const userNameElements = document.querySelectorAll('#userName');
    if (userNameElements.length > 0) {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        userNameElements.forEach(el => {
            el.textContent = user.real_name || user.username || '用户';
        });
    }
});

// 显示消息提示
function showMessage(message, type = 'info') {
    const messageDiv = document.getElementById('loginMessage') || 
                      document.getElementById('registerMessage') ||
                      document.createElement('div');
    
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    messageDiv.classList.remove('hidden');
    
    // 如果是新创建的元素，添加到页面
    if (!messageDiv.parentNode) {
        document.body.appendChild(messageDiv);
    }
    
    // 3秒后自动隐藏
    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 3000);
}

// 获取认证头部
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// API请求封装
async function apiRequest(endpoint, options = {}) {
    const headers = getAuthHeaders();
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers,
        ...options
    });
    
    if (response.status === 401) {
        // 未授权，跳转到登录页
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
        throw new Error('未授权');
    }
    
    return response.json();
}

// 获取用户信息
async function getUserProfile() {
    try {
        const response = await apiRequest('/auth/me');
        if (response.success) {
            return response.user;
        }
    } catch (error) {
        console.error('获取用户信息失败:', error);
    }
    return null;
}