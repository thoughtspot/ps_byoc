<p align="center">
    <img src="https://raw.githubusercontent.com/thoughtspot/visual-embed-sdk/main/static/doc-images/images/TS-Logo-black-no-bg.svg" width=250 height=250 align="center" alt="ThoughtSpot" />
</p>

<br/>

# Custom Charts (BYOC) – Deployment Guide

You can now use custom charts in ThoughtSpot. To deploy custom charts in ThoughtSpot, please follow the below steps:

## Access the Code

Access the code from the [ThoughtSpot GitHub repository](https://github.com/thoughtspot/ps_byoc/tree/main).

Click on `kpi_comparison_chart`.


<p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/TS%20Github%20Repository.png" width=600 height=400 align="center" alt="TS Github" />


## Download the Necessary Files

Download the following files:
- `index.html`
- `main.js`
- `manifest.json`
- `package.json`
- `style.css`

<p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/Files%20to%20Download.png" width=800 height=450 align="center" alt="ThoughtSpot" />

    
## Create a Repository on CVS GitHub

Create a repository on CVS GitHub named `your_repository_name`.

## Deploying the Code

You can host the code on a server to make it available for use. To deploy your charts, you can use Vercel, Netlify, or any server that can render an HTML page.

### Example: Deploy on Vercel

1. Navigate to the [Vercel application](https://vercel.app/).
2. Click on **Start Deploying**.

<p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/Vercel%20Home%20Page.png" width=500 height=350 align="center" alt="Vercel Home Page" />

3. To deploy a new project, import an existing Git repository. Select **Continue with GitHub**.

<p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/Vercel%20--%3E%20Github.png" width=300 height=250 align="center" alt="Vercel --> GitHub" />

4. Provide your GitHub login credentials to continue to Vercel using your GitHub account.
   
5. After logging in to Vercel using your GitHub account, select the correct repository that has the JavaScript code and import the repository.

<p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/Select%20Repository.png" width=450 height=350 align="center" alt="Select Repository" />   
    
    
6. Configure the project and deploy the code.

   <p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/Configure%20and%20Deploy.png" width=600 height=550 align="center" alt="Configure and Deploy" /> 


Once the code is deployed, Vercel will provide a URL where your service is hosted. Visit this URL to ensure your application is running as expected.

## Using the URL to Set Up Custom Chart in ThoughtSpot

1. Ensure that Custom Charts is enabled on your cluster.
2. Navigate to the **Admin Page** on your ThoughtSpot cluster.

<p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/TS%20Admin%20Tab.png" width=700 height=100 align="center" alt="Admin Tab" /> 
   
3. Click on **Chart Customisation → Custom Charts → Add Chart**.

   <p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/Chart%20Customisation%20Window.png" width=800 height=600 align="center" alt="Chart customisation Window" /> 

4. In the pop-up, fill in the required information:
    - **Name**: Name of the Custom Chart
    - **Description** (optional)
    - **Application URL**: URL obtained after deploying in Vercel
    - **Icon URL** (optional): Icon image for the Custom Chart
    - **Author Name** (optional)
    - **Author Email** (optional)
    - **Author Organization** (optional)

<p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/Chart%20Customisation%20Details.png" width=500 height=500 align="center" alt="Chart customisation details" /> 

5. Click **Add Chart**.
   
Your new chart will appear on the Custom Charts page and will be available for use when creating a chart in ThoughtSpot.

<p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/Custom%20KPI%20comparison%20Chart.png" width=750 height=650 align="center" alt="KPI comparison Chart" /> 

