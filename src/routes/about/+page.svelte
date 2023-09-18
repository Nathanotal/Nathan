<head>
	<title>About Me</title>
</head>

<!-- Introduction -->
<!-- <div class="about-section">
	<p>Welcome to my Neuromorphic simulator!</p>
	
    <p>You can find more projects on my GitHub: 
        <a href='https://github.com/Nathanotal/'>
		    <i class="fa-brands fa-github navigation_icon"></i>
	    </a>
    </p>
    <p>
        Feel free to send me a message on LinkedIn:
        <a href='https://www.linkedin.com/in/Nathanotal/'>
            <i class="fa-brands fa-linkedin navigation_icon"></i>
        </a>
    </p>
    
</div> -->

<div class="about-section">
	<h2>Welcome to my Neuromorphic Simulator!</h2>
	<p>Whilst the controls are somewhat complicated here is a short run-down:</p>
    <div class="explanation_section">
    <ul class="settings-list">    
        <li>Simulation speed (default = 200):<br> 
            The speed of the simulation measured in animation frames. </li>
		<li>Users (default = 6):<br> 
            The amount of users which should be allocated. </li>
		<li>Servers (default = 4):<br> 
            The amount of servers which can allocate users. </li>
		<li>Server capacity (default = 3):<br> 
            The amount of users one server can allocate. </li>
		<li>Principal neuron threshold (default = 3):<br> 
            The threshold of the main neurons. <br>
            See this <a href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4811945/">research paper</a> for more information. </li>
		<li>Noise probability (default = 3):<br> 
            The probability of noise being introduced to the system at one timestep for one principal neuron. </li>
		<li>Noise strength (default = 1):<br> 
            The excitative strength of the noise. </li>
		<li>WTA inhibition (default = 2):<br> 
            The inhibitory strength of the control neuron which makes sure a user is only allocated to a single server at any one point in time. </li>
		<li>Capacity inhibition (default = 4):<br> 
            The inhibitory strenth of the neuron which makes sure that the servers capacity constraint is not broken. </li>
		<li>Utilization excitation (default = 1):<br> 
            The exitative strength of the utilization neuron which tries to fill up servers which are already active in order to solve the problem as efficiently as possible. </li>
		<li>Server range (default = 6):<br> 
            The range of the servers in the problem we are trying to solve, measured in percent of the problem space. </li>
    </ul>
</div>
	
    <div class="social-links">
        <p>You can find more projects on my 
            <a href='https://github.com/Nathanotal/' class="social-icon">
		        GitHub <i class="fa-brands fa-github"></i>
	        </a>
        </p>
        <p>Feel free to send me a message on 
            <a href='https://www.linkedin.com/in/Nathanotal/' class="social-icon">
                LinkedIn <i class="fa-brands fa-linkedin"></i>
            </a>
        </p>
    </div>
</div>

<!-- Styling -->
<style>
	.about-section {
		margin: 40px;
		padding: 20px;
		border-radius: 10px;
		background-color: #f9f9f9;
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        width: 80%;
        /* Center yoursefl */
        margin-left: auto;
        margin-right: auto;

	}

    .explanation_section {
        margin-top: 20px;
        margin-bottom: 20px;
        max-height: 50%;  /* Set a maximum height */
        overflow-y: auto;  /* Make it scrollable */
    }

	h2 {
		font-size: 28px;
		margin-bottom: 20px;
	}

	.social-links {
        text-align: center;
        background-color: #f2f2f2;
        padding: 20px;
        border-radius: 10px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        margin-top: 20px;
    }

    .social-links p {
        margin: 10px 0;
        font-size: 18px;
    }

    .social-icon {
        text-decoration: none;
        color: #007bff;
        font-weight: bold;
    }

    .fa-brands {
        font-size: 24px;
        margin-left: 10px;
        vertical-align: middle;
    }

    /* Updated styles for the ul */
    .settings-list {
        list-style-type: none;
        margin-left: 0;
        padding-left: 0;
    }

    .settings-list li {
        margin-bottom: 20px;
        font-size: 16px;
        padding: 10px;
        border-radius: 8px;
        background-color: #f2f2f2;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .settings-list li a {
        color: #007bff;
        text-decoration: none;
    }

    .settings-list li a:hover {
        text-decoration: underline;
    }
</style>